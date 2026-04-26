(function () {
    'use strict';

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function indentStr(n, width) { return new Array(n * width + 1).join(' '); }

    function childPath(parentPath, key, isArr) {
        if (isArr) return parentPath + '[' + key + ']';
        return parentPath ? parentPath + '.' + key : String(key);
    }

    function toJsonPath(path) {
        if (!path) return '$';
        if (path.charAt(0) === '[') return '$' + path;
        return '$.' + path;
    }

    function pathToKeys(path) {
        var keys = [];
        if (!path) return keys;
        var i = 0;
        var buf = '';
        function flush() { if (buf) { keys.push(buf); buf = ''; } }
        while (i < path.length) {
            var c = path.charAt(i);
            if (c === '.') { flush(); i++; }
            else if (c === '[') {
                flush();
                var end = path.indexOf(']', i);
                if (end < 0) break;
                keys.push(parseInt(path.substring(i + 1, end), 10));
                i = end + 1;
            } else { buf += c; i++; }
        }
        flush();
        return keys;
    }

    function getValueAtPath(parsed, keys) {
        var node = parsed;
        for (var i = 0; i < keys.length; i++) {
            if (node === null || typeof node !== 'object') return undefined;
            node = node[keys[i]];
        }
        return node;
    }

    function cssEscape(s) {
        if (window.CSS && CSS.escape) return CSS.escape(s);
        return String(s).replace(/(["\\\[\]])/g, '\\$1');
    }

    function highlightText(text, search) {
        var t = String(text);
        if (!search) return escapeHtml(t);
        var lower = t.toLowerCase();
        var slower = search.toLowerCase();
        var slen = search.length;
        var idx = lower.indexOf(slower);
        if (idx < 0) return escapeHtml(t);
        var out = '';
        var i = 0;
        while (idx >= 0) {
            out += escapeHtml(t.substring(i, idx));
            out += '<mark class="jb-match">' + escapeHtml(t.substring(idx, idx + slen)) + '</mark>';
            i = idx + slen;
            idx = lower.indexOf(slower, i);
        }
        out += escapeHtml(t.substring(i));
        return out;
    }

    function primitiveHtml(value, search) {
        if (value === null) return '<span class="tok-null">null</span>';
        if (typeof value === 'string') return '<span class="tok-string">' + highlightText(JSON.stringify(value), search) + '</span>';
        if (typeof value === 'number') return '<span class="tok-number">' + highlightText(String(value), search) + '</span>';
        if (typeof value === 'boolean') return '<span class="tok-bool">' + highlightText(String(value), search) + '</span>';
        return escapeHtml(String(value));
    }

    function buildSearchSets(value, search, basePath) {
        var matches = [];
        var matchSet = {};
        var ancestorSet = {};
        if (!search) return { matches: matches, matchSet: matchSet, ancestorSet: ancestorSet };
        var s = search.toLowerCase();

        function check(text) {
            return text != null && String(text).toLowerCase().indexOf(s) >= 0;
        }

        function visit(node, path, key, isArrChild) {
            var keyMatch = (key !== null && !isArrChild && check(key));
            if (typeof node !== 'object' || node === null) {
                var valMatch = check(node) || (typeof node === 'string' && check(JSON.stringify(node)));
                if (keyMatch || valMatch) {
                    if (!matchSet[path]) {
                        matchSet[path] = 1;
                        matches.push(path);
                    }
                    return true;
                }
                return false;
            }
            var any = false;
            if (keyMatch) {
                if (!matchSet[path]) {
                    matchSet[path] = 1;
                    matches.push(path);
                }
                any = true;
            }
            var isArr = Array.isArray(node);
            var keys = isArr ? node.map(function (_, i) { return i; }) : Object.keys(node);
            keys.forEach(function (k) {
                if (visit(node[k], childPath(path, k, isArr), k, isArr)) any = true;
            });
            if (any) ancestorSet[path] = 1;
            return any;
        }

        visit(value, basePath, null, false);
        return { matches: matches, matchSet: matchSet, ancestorSet: ancestorSet };
    }

    function renderJson(value, depth, keyLabel, trailingComma, indentWidth, ctr, path, ctx) {
        var pad = indentStr(depth, indentWidth);
        var keyHtml = keyLabel !== null
            ? '<span class="tok-key">' + highlightText(JSON.stringify(keyLabel), ctx.search) + '</span>: '
            : '';
        var comma = trailingComma ? ',' : '';
        var pathAttr = ' data-path="' + escapeHtml(path) + '"';
        var matchClass = ctx.matchSet[path] ? ' jb-has-match' : '';
        var copyBtn = '<button type="button" class="jsonb-copy-btn" aria-label="Copy JSONPath" tabindex="-1" title="Copy JSONPath">⧉</button>';

        if (value === null || typeof value !== 'object') {
            return '<div class="jb-line jb-leaf' + matchClass + '" data-ln="' + (ctr.n++) + '"' + pathAttr + '>' +
                pad + keyHtml + primitiveHtml(value, ctx.search) + comma + copyBtn +
                '</div>';
        }

        var isArr = Array.isArray(value);
        var keys = isArr ? value.map(function (_, i) { return i; }) : Object.keys(value);
        var openB = isArr ? '[' : '{';
        var closeB = isArr ? ']' : '}';

        if (keys.length === 0) {
            return '<div class="jb-line jb-empty' + matchClass + '" data-ln="' + (ctr.n++) + '"' + pathAttr + '>' +
                pad + keyHtml + openB + closeB + comma + copyBtn +
                '</div>';
        }

        var hasMatchInSubtree = ctx.search && (ctx.ancestorSet[path] || ctx.matchSet[path]);
        var depthExceeded = ctx.depthLimit > 0 && depth >= ctx.depthLimit;

        if (depthExceeded && !hasMatchInSubtree && depth > 0) {
            var unit = keys.length === 1 ? (isArr ? ' item' : ' key') : (isArr ? ' items' : ' keys');
            var summaryText = openB + '...' + closeB + ' (' + keys.length + unit + ')';
            return '<div class="jb-line jb-summary' + matchClass + '" data-ln="' + (ctr.n++) + '"' + pathAttr + '>' +
                pad + keyHtml +
                '<button type="button" class="jb-zoomable" data-zoom="' + escapeHtml(path) + '" title="Zoom into this node">' +
                escapeHtml(summaryText) + '</button>' +
                comma + copyBtn +
                '</div>';
        }

        var unitFull = keys.length === 1 ? (isArr ? ' item' : ' key') : (isArr ? ' items' : ' keys');
        var summaryFull = keys.length + unitFull;
        var headerLn = ctr.n++;
        var children = keys.map(function (k, i) {
            return renderJson(value[k], depth + 1, isArr ? null : k, i < keys.length - 1, indentWidth, ctr, childPath(path, k, isArr), ctx);
        }).join('');
        var footerLn = ctr.n++;

        var startCollapsed = ctx.search && !hasMatchInSubtree && depth > 0;
        var toggleArrow = startCollapsed ? '▸' : '▾';
        var toggleAria  = startCollapsed ? 'false' : 'true';
        var toggleLabel = startCollapsed ? 'Expand' : 'Collapse';

        var blockClasses = 'jb-block';
        if (startCollapsed) blockClasses += ' is-collapsed';
        if (hasMatchInSubtree) blockClasses += ' is-search-match';

        var zoomable = depth > 0
            ? '<button type="button" class="jb-zoomable" data-zoom="' + escapeHtml(path) + '" title="Zoom into this node">' + openB + '</button>'
            : '<span class="jb-bracket">' + openB + '</span>';

        return '<div class="' + blockClasses + '"' + pathAttr + '>' +
            '<div class="jb-line jb-header' + matchClass + '" data-ln="' + headerLn + '"' + pathAttr + '>' + pad +
                '<button type="button" class="jb-toggle" aria-expanded="' + toggleAria + '" aria-label="' + toggleLabel + '">' + toggleArrow + '</button>' +
                keyHtml + zoomable +
                '<span class="jb-ellipsis"> ... ' + summaryFull + ' ' + closeB + comma + '</span>' +
                copyBtn +
            '</div>' +
            '<div class="jb-children">' + children + '</div>' +
            '<div class="jb-line jb-footer" data-ln="' + footerLn + '"' + pathAttr + '>' + pad + closeB + comma + '</div>' +
        '</div>';
    }

    function flattenLeaves(value, basePath, results) {
        if (value === null || typeof value !== 'object') {
            results.push({ path: basePath, value: value });
            return;
        }
        var isArr = Array.isArray(value);
        var keys = isArr ? value.map(function (_, i) { return i; }) : Object.keys(value);
        if (keys.length === 0) {
            results.push({ path: basePath, value: value, empty: true, isArr: isArr });
            return;
        }
        keys.forEach(function (k) {
            flattenLeaves(value[k], childPath(basePath, k, isArr), results);
        });
    }

    function formatFlatValue(item) {
        if (item.empty) return item.isArr ? '[]' : '{}';
        var v = item.value;
        if (v === null) return 'null';
        if (typeof v === 'string') return JSON.stringify(v);
        return String(v);
    }

    function renderFlat(items, search) {
        var s = search ? search.toLowerCase() : '';
        var html = '';
        var shown = 0;
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var jp = toJsonPath(item.path);
            var valStr = formatFlatValue(item);
            if (s && jp.toLowerCase().indexOf(s) < 0 && valStr.toLowerCase().indexOf(s) < 0) continue;
            shown++;
            html += '<li class="fleaf" data-copy="' + escapeHtml(jp) + '" data-path="' + escapeHtml(item.path) + '">' +
                '<button type="button" class="fpath" aria-label="Copy ' + escapeHtml(jp) + '" title="Click to copy path">' +
                highlightText(jp, search) +
                '</button>' +
                '<span class="fv">' + highlightText(valStr, search) + '</span>' +
                '</li>';
        }
        return { html: html, count: shown };
    }

    function collectAllPaths(value, basePath, baseKeys, baseIsArr, results, limit) {
        if (results.length >= limit) return;
        if (value === null || typeof value !== 'object') return;
        var isArr = Array.isArray(value);
        var keys = isArr ? value.map(function (_, i) { return i; }) : Object.keys(value);
        for (var i = 0; i < keys.length; i++) {
            if (results.length >= limit) return;
            var k = keys[i];
            var newKeys = baseKeys.concat([k]);
            var newIsArr = baseIsArr.concat([isArr]);
            var newPath = childPath(basePath, k, isArr);
            var v = value[k];
            var isBranch = v !== null && typeof v === 'object';
            var hint;
            if (isBranch) {
                var ck = Array.isArray(v) ? v.length : Object.keys(v).length;
                hint = Array.isArray(v)
                    ? '[' + ck + (ck === 1 ? ' item' : ' items') + ']'
                    : '{' + ck + (ck === 1 ? ' key' : ' keys') + '}';
            } else if (v === null) {
                hint = 'null';
            } else if (typeof v === 'string') {
                hint = JSON.stringify(v.length > 32 ? v.slice(0, 32) + '…' : v);
            } else {
                hint = String(v);
            }
            results.push({
                path: newPath,
                keys: newKeys,
                isArrAt: newIsArr,
                isBranch: isBranch,
                hint: hint
            });
            collectAllPaths(v, newPath, newKeys, newIsArr, results, limit);
        }
    }

    function splitPathQuery(q) {
        return q.split('/').map(function (s) { return s.trim(); });
    }

    function matchPathfinder(inputSegs, resultKeys) {
        if (inputSegs.length !== resultKeys.length) return null;
        var spans = [];
        for (var i = 0; i < inputSegs.length; i++) {
            var iseg = inputSegs[i].toLowerCase();
            var rseg = String(resultKeys[i]);
            if (!iseg) { spans.push(-1); continue; }
            var idx = rseg.toLowerCase().indexOf(iseg);
            if (idx < 0) return null;
            spans.push(idx);
        }
        return spans;
    }

    function highlightSegment(seg, queryLower, matchIdx) {
        var s = String(seg);
        if (matchIdx < 0 || !queryLower) return escapeHtml(s);
        var len = queryLower.length;
        return escapeHtml(s.substring(0, matchIdx)) +
            '<mark class="jb-match">' + escapeHtml(s.substring(matchIdx, matchIdx + len)) + '</mark>' +
            escapeHtml(s.substring(matchIdx + len));
    }

    function renderPathfinderResults(results, inputSegs, activeIdx) {
        if (results.length === 0) {
            return '<li class="jsonb-pf-empty" role="presentation">No matching paths</li>';
        }
        return results.map(function (r, i) {
            var parts = r.keys.map(function (k, j) {
                var iseg = inputSegs[j];
                var matchIdx = (r.spans && r.spans[j] != null) ? r.spans[j] : -1;
                var isArrChild = r.isArrAt && r.isArrAt[j];
                var label = isArrChild ? '[' + k + ']' : String(k);
                var sep = j === 0 ? '' : (isArrChild ? '' : '<span class="jsonb-pf-sep">/</span>');
                return sep + '<span class="jsonb-pf-seg">' + highlightSegment(label, iseg ? iseg.toLowerCase() : '', matchIdx) + '</span>';
            }).join('');
            var icon = r.isBranch ? '<span class="jsonb-pf-icon jsonb-pf-branch" aria-hidden="true">›</span>' : '<span class="jsonb-pf-icon jsonb-pf-leaf" aria-hidden="true">·</span>';
            return '<li class="jsonb-pf-result' + (i === activeIdx ? ' is-active' : '') +
                '" role="option" aria-selected="' + (i === activeIdx ? 'true' : 'false') +
                '" data-pf-idx="' + i + '">' +
                icon +
                '<span class="jsonb-pf-path">' + parts + '</span>' +
                '<span class="jsonb-pf-hint">' + escapeHtml(r.hint) + '</span>' +
                '</li>';
        }).join('');
    }

    function renderBreadcrumbs(parsed, focusKeys) {
        var crumbs = [{ label: '$', keys: [] }];
        var node = parsed;
        for (var i = 0; i < focusKeys.length; i++) {
            var key = focusKeys[i];
            var isArr = Array.isArray(node);
            var label = isArr ? '[' + key + ']' : String(key);
            crumbs.push({ label: label, keys: focusKeys.slice(0, i + 1) });
            node = (node !== null && typeof node === 'object') ? node[key] : undefined;
        }
        return crumbs.map(function (c, idx) {
            var isLast = idx === crumbs.length - 1;
            var item = '<li class="jsonb-bc-item' + (isLast ? ' is-current' : '') + '">' +
                '<button type="button" class="jsonb-bc-btn" data-keys="' + escapeHtml(JSON.stringify(c.keys)) + '"' +
                (isLast ? ' aria-current="location"' : '') + '>' +
                escapeHtml(c.label) + '</button></li>';
            if (idx < crumbs.length - 1) {
                item += '<li class="jsonb-bc-sep" aria-hidden="true">›</li>';
            }
            return item;
        }).join('');
    }

    function attach(root) {
        var indent     = parseInt(root.getAttribute('data-indent'), 10) || 2;
        var flattenOn  = root.getAttribute('data-flatten') === 'true';
        var input      = root.querySelector('.jsonb-input');
        var output     = root.querySelector('.jsonb-output');
        var status     = root.querySelector('.jsonb-status');
        var flatList   = root.querySelector('.jsonb-flat-list');
        var flatCount  = root.querySelector('.jsonb-flat-count');
        var searchInput= root.querySelector('.jsonb-search');
        var matchCount = root.querySelector('.jsonb-match-count');
        var matchPrev  = root.querySelector('.jsonb-match-prev');
        var matchNext  = root.querySelector('.jsonb-match-next');
        var depthSelect= root.querySelector('.jsonb-depth-select');
        var bcList     = root.querySelector('.jsonb-bc-list');
        var bcReset    = root.querySelector('.jsonb-bc-reset');
        var pfWrap     = root.querySelector('.jsonb-pathfinder');
        var pfInput    = root.querySelector('.jsonb-pathfinder-input');
        var pfResults  = root.querySelector('.jsonb-pathfinder-results');
        var pfClear    = root.querySelector('.jsonb-pathfinder-clear');
        var toast      = root.querySelector('.jsonb-toast');

        var state = {
            parsed: null,
            valid: false,
            focusPath: [],
            depthLimit: 0,
            search: '',
            searchSets: { matches: [], matchSet: {}, ancestorSet: {} },
            activeMatch: -1
        };

        var searchTimer = null;
        var toastTimer  = null;
        var pfTimer     = null;
        var pfState     = { open: false, results: [], activeIdx: 0, query: '' };
        var pfPathCache = null;
        var pfCacheKey  = null;
        var PF_LIMIT    = 200;

        function showToast(msg) {
            if (!toast) return;
            toast.textContent = msg;
            toast.classList.add('is-visible');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(function () {
                toast.classList.remove('is-visible');
            }, 1500);
        }

        function copyToClipboard(text) {
            var done = function () { showToast('Copied: ' + text); };
            var fail = function () { fallbackCopy(text); };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                try {
                    navigator.clipboard.writeText(text).then(done, fail);
                    return;
                } catch (e) { /* fall through */ }
            }
            fallbackCopy(text);
        }

        function fallbackCopy(text) {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            var ok = false;
            try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            document.body.removeChild(ta);
            showToast(ok ? 'Copied: ' + text : 'Copy failed');
        }

        function focusedValue() { return getValueAtPath(state.parsed, state.focusPath); }

        function basePath() {
            var node = state.parsed;
            var path = '';
            for (var i = 0; i < state.focusPath.length; i++) {
                var key = state.focusPath[i];
                var isArr = Array.isArray(node);
                path = childPath(path, key, isArr);
                node = (node !== null && typeof node === 'object') ? node[key] : undefined;
            }
            return path;
        }

        function parse() {
            var raw = input.value;
            if (raw.trim() === '') {
                state.parsed = null;
                state.valid = false;
                state.focusPath = [];
                if (status) { status.textContent = ''; status.className = 'jsonb-status'; }
                return;
            }
            try {
                state.parsed = JSON.parse(raw);
                state.valid = true;
                if (status) { status.textContent = 'Valid JSON'; status.className = 'jsonb-status is-ok'; }
                var node = state.parsed;
                for (var i = 0; i < state.focusPath.length; i++) {
                    if (node === null || typeof node !== 'object' || !(state.focusPath[i] in node)) {
                        state.focusPath = state.focusPath.slice(0, i);
                        break;
                    }
                    node = node[state.focusPath[i]];
                }
            } catch (e) {
                state.valid = false;
                if (status) { status.textContent = e.message; status.className = 'jsonb-status is-error'; }
            }
        }

        function render() {
            if (!state.valid) {
                output.innerHTML = '';
                if (flatList) flatList.innerHTML = '';
                if (flatCount) flatCount.textContent = '';
                if (bcList) bcList.innerHTML = '';
                state.searchSets = { matches: [], matchSet: {}, ancestorSet: {} };
                updateMatchUI();
                return;
            }

            var fv = focusedValue();
            var bp = basePath();

            state.searchSets = buildSearchSets(fv, state.search, bp);
            if (state.search && state.searchSets.matches.length > 0) {
                if (state.activeMatch < 0 || state.activeMatch >= state.searchSets.matches.length) state.activeMatch = 0;
            } else {
                state.activeMatch = -1;
            }

            if (bcList) bcList.innerHTML = renderBreadcrumbs(state.parsed, state.focusPath);

            var ctx = {
                search: state.search,
                matchSet: state.searchSets.matchSet,
                ancestorSet: state.searchSets.ancestorSet,
                depthLimit: state.depthLimit
            };
            output.innerHTML = renderJson(fv, 0, null, false, indent, { n: 1 }, bp, ctx);

            if (flattenOn && flatList) {
                var items = [];
                flattenLeaves(fv, bp, items);
                var flatRender = renderFlat(items, state.search);
                flatList.innerHTML = flatRender.html;
                if (flatCount) {
                    if (state.search) {
                        flatCount.textContent = flatRender.count + ' / ' + items.length + ' rows';
                    } else {
                        flatCount.textContent = items.length + ' row' + (items.length === 1 ? '' : 's');
                    }
                }
            }

            updateMatchUI();
            if (state.activeMatch >= 0) markActiveMatch(false);
        }

        function updateMatchUI() {
            var n = state.searchSets.matches.length;
            if (!state.search) {
                matchCount.textContent = '';
                matchPrev.disabled = true;
                matchNext.disabled = true;
                return;
            }
            if (n === 0) {
                matchCount.textContent = '0 matches';
                matchPrev.disabled = true;
                matchNext.disabled = true;
            } else {
                matchCount.textContent = (state.activeMatch + 1) + ' of ' + n + ' matches';
                matchPrev.disabled = false;
                matchNext.disabled = false;
            }
        }

        function markActiveMatch(scroll) {
            output.querySelectorAll('.jb-active-match').forEach(function (el) { el.classList.remove('jb-active-match'); });
            output.querySelectorAll('.jb-match.is-active').forEach(function (el) { el.classList.remove('is-active'); });
            if (state.activeMatch < 0 || state.activeMatch >= state.searchSets.matches.length) return;
            var path = state.searchSets.matches[state.activeMatch];
            var sel = '[data-path="' + cssEscape(path) + '"]';
            var line = output.querySelector('.jb-line' + sel);
            if (!line) return;
            line.classList.add('jb-active-match');
            var firstMark = line.querySelector('.jb-match');
            if (firstMark) firstMark.classList.add('is-active');
            if (scroll) line.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        function gotoMatch(delta) {
            var n = state.searchSets.matches.length;
            if (n === 0) return;
            if (state.activeMatch < 0) state.activeMatch = 0;
            else state.activeMatch = (state.activeMatch + delta + n) % n;
            updateMatchUI();
            markActiveMatch(true);
        }

        function setFocusKeys(keys) {
            state.focusPath = keys;
            state.activeMatch = -1;
            render();
        }

        input.addEventListener('input', function () {
            parse();
            render();
        });

        searchInput.addEventListener('input', function () {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function () {
                var v = searchInput.value.trim();
                if (v === state.search) return;
                state.search = v;
                state.activeMatch = -1;
                render();
            }, 300);
        });

        searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (searchTimer) {
                    clearTimeout(searchTimer);
                    searchTimer = null;
                    var v = searchInput.value.trim();
                    if (v !== state.search) {
                        state.search = v;
                        state.activeMatch = -1;
                        render();
                        return;
                    }
                }
                gotoMatch(e.shiftKey ? -1 : 1);
            } else if (e.key === 'Escape') {
                if (searchInput.value !== '') {
                    e.preventDefault();
                    searchInput.value = '';
                    state.search = '';
                    state.activeMatch = -1;
                    render();
                }
            }
        });

        matchPrev.addEventListener('click', function () { gotoMatch(-1); });
        matchNext.addEventListener('click', function () { gotoMatch(1); });

        depthSelect.addEventListener('change', function () {
            state.depthLimit = parseInt(depthSelect.value, 10) || 0;
            render();
        });

        bcReset.addEventListener('click', function () {
            if (state.focusPath.length === 0) return;
            setFocusKeys([]);
        });

        bcList.addEventListener('click', function (e) {
            var btn = e.target.closest('.jsonb-bc-btn');
            if (!btn) return;
            var keys;
            try { keys = JSON.parse(btn.getAttribute('data-keys') || '[]'); }
            catch (err) { keys = []; }
            setFocusKeys(keys);
        });

        bcList.addEventListener('keydown', function (e) {
            var btns = Array.prototype.slice.call(bcList.querySelectorAll('.jsonb-bc-btn'));
            var idx = btns.indexOf(document.activeElement);
            if (idx < 0) return;
            if (e.key === 'ArrowRight' && idx < btns.length - 1) { e.preventDefault(); btns[idx + 1].focus(); }
            else if (e.key === 'ArrowLeft' && idx > 0) { e.preventDefault(); btns[idx - 1].focus(); }
        });

        output.addEventListener('click', function (e) {
            var toggle = e.target.closest('.jb-toggle');
            if (toggle) {
                var block = toggle.closest('.jb-block');
                if (block) {
                    var collapsed = block.classList.toggle('is-collapsed');
                    toggle.textContent = collapsed ? '▸' : '▾';
                    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                    toggle.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse');
                }
                e.stopPropagation();
                return;
            }
            var copyBtn = e.target.closest('.jsonb-copy-btn');
            if (copyBtn) {
                var line = copyBtn.closest('[data-path]');
                if (line) copyToClipboard(toJsonPath(line.getAttribute('data-path') || ''));
                e.stopPropagation();
                return;
            }
            var zoom = e.target.closest('.jb-zoomable');
            if (zoom) {
                var zPath = zoom.getAttribute('data-zoom') || '';
                setFocusKeys(pathToKeys(zPath));
                e.stopPropagation();
                return;
            }
        });

        if (flatList) {
            flatList.addEventListener('click', function (e) {
                var btn = e.target.closest('.fpath');
                if (!btn) return;
                var li = btn.closest('[data-copy]');
                if (li) copyToClipboard(li.getAttribute('data-copy') || '');
            });
        }

        root.querySelectorAll('.jsonb-foldall').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var collapse = btn.getAttribute('data-action') === 'collapse';
                output.querySelectorAll('.jb-block').forEach(function (block) {
                    block.classList.toggle('is-collapsed', collapse);
                });
                output.querySelectorAll('.jb-toggle').forEach(function (t) {
                    t.textContent = collapse ? '▸' : '▾';
                    t.setAttribute('aria-expanded', collapse ? 'false' : 'true');
                    t.setAttribute('aria-label', collapse ? 'Expand' : 'Collapse');
                });
            });
        });

        root.querySelectorAll('.jsonb-expand').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var target = btn.closest('.jsonb-pane, .jsonb-flat');
                if (!target) return;
                var expanded = target.classList.toggle('is-expanded');
                document.body.classList.toggle('jsonb-locked', !!document.querySelector('.jsonb-pane.is-expanded, .jsonb-flat.is-expanded'));
                btn.textContent = expanded ? '✕' : '⛶';
                btn.setAttribute('aria-label', expanded ? 'Collapse' : 'Expand');
                btn.setAttribute('title', expanded ? 'Collapse' : 'Expand');
            });
        });

        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            var any = root.querySelector('.is-expanded');
            if (!any) return;
            root.querySelectorAll('.is-expanded').forEach(function (el) {
                el.classList.remove('is-expanded');
                var btn = el.querySelector('.jsonb-expand');
                if (btn) { btn.textContent = '⛶'; btn.setAttribute('aria-label', 'Expand'); btn.setAttribute('title', 'Expand'); }
            });
            document.body.classList.remove('jsonb-locked');
        });

        // Pathfinder
        function pfBuildIndex() {
            var key = JSON.stringify(state.focusPath);
            if (pfCacheKey === key && pfPathCache) return pfPathCache;
            var bp = basePath();
            var arr = [];
            collectAllPaths(focusedValue(), bp, [], [], arr, 5000);
            pfPathCache = arr;
            pfCacheKey = key;
            return arr;
        }

        function pfInvalidateIndex() {
            pfPathCache = null;
            pfCacheKey = null;
        }

        function pfCompute() {
            var raw = pfInput.value;
            var inputSegs = splitPathQuery(raw);
            var index = pfBuildIndex();
            var results = [];
            for (var i = 0; i < index.length; i++) {
                if (results.length >= PF_LIMIT) break;
                var spans = matchPathfinder(inputSegs, index[i].keys);
                if (!spans) continue;
                var entry = {
                    path: index[i].path,
                    keys: index[i].keys,
                    isArrAt: index[i].isArrAt,
                    isBranch: index[i].isBranch,
                    hint: index[i].hint,
                    spans: spans,
                    depth: index[i].keys.length
                };
                results.push(entry);
            }
            results.sort(function (a, b) {
                if (a.depth !== b.depth) return a.depth - b.depth;
                return 0;
            });
            pfState.results = results;
            pfState.query = raw;
            pfState.activeIdx = results.length ? 0 : -1;
            pfState.inputSegs = inputSegs;
        }

        function pfRender() {
            if (!pfState.open) {
                pfResults.hidden = true;
                pfInput.setAttribute('aria-expanded', 'false');
                return;
            }
            pfResults.hidden = false;
            pfInput.setAttribute('aria-expanded', 'true');
            pfResults.innerHTML = renderPathfinderResults(pfState.results, pfState.inputSegs || [], pfState.activeIdx);
            pfClear.hidden = pfInput.value === '';
        }

        function pfOpen() {
            if (!state.valid) return;
            pfState.open = true;
            pfCompute();
            pfRender();
        }

        function pfClose() {
            pfState.open = false;
            pfRender();
        }

        function pfRefresh() {
            if (!pfState.open) return;
            pfCompute();
            pfRender();
            pfScrollActive();
        }

        function pfScrollActive() {
            if (pfState.activeIdx < 0) return;
            var el = pfResults.querySelector('.jsonb-pf-result.is-active');
            if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
        }

        function pfSelect(idx, drillIn) {
            var r = pfState.results[idx];
            if (!r) return;
            if (drillIn) {
                var labels = r.keys.map(function (k, j) {
                    return r.isArrAt[j] ? '[' + k + ']' : String(k);
                });
                pfInput.value = labels.join('/') + '/';
                pfRefresh();
                return;
            }
            // Navigate: leaves zoom into parent and scroll; branches zoom into self
            var targetKeys, scrollTo;
            if (r.isBranch) {
                targetKeys = state.focusPath.concat(r.keys);
                scrollTo = null;
            } else {
                targetKeys = state.focusPath.concat(r.keys.slice(0, -1));
                scrollTo = state.focusPath.concat(r.keys);
            }
            pfClose();
            pfInput.value = '';
            pfClear.hidden = true;
            state.focusPath = targetKeys;
            state.activeMatch = -1;
            render();
            if (scrollTo) {
                var fullPath = '';
                var node = state.parsed;
                for (var j = 0; j < scrollTo.length; j++) {
                    var isArrParent = Array.isArray(node);
                    fullPath = childPath(fullPath, scrollTo[j], isArrParent);
                    node = (node !== null && typeof node === 'object') ? node[scrollTo[j]] : undefined;
                }
                var sel = '[data-path="' + cssEscape(fullPath) + '"]';
                var line = output.querySelector('.jb-line' + sel);
                if (line) {
                    line.classList.add('jb-active-match');
                    line.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(function () { line.classList.remove('jb-active-match'); }, 1800);
                }
            }
        }

        function pfTryAutocomplete() {
            var raw = pfInput.value;
            var segs = splitPathQuery(raw);
            if (segs.length === 0) return false;
            var lastIdx = segs.length - 1;
            var lastSeg = segs[lastIdx];
            if (!lastSeg) return false;
            // Find unique key at this level among current results
            var seen = {};
            var unique = null;
            for (var i = 0; i < pfState.results.length; i++) {
                var r = pfState.results[i];
                if (r.keys.length <= lastIdx) continue;
                var label = r.isArrAt[lastIdx] ? '[' + r.keys[lastIdx] + ']' : String(r.keys[lastIdx]);
                if (!seen[label]) {
                    seen[label] = 1;
                    if (unique === null) unique = label;
                    else { unique = false; break; }
                }
            }
            if (!unique) return false;
            segs[lastIdx] = unique;
            pfInput.value = segs.join('/') + '/';
            pfRefresh();
            return true;
        }

        pfInput.addEventListener('focus', function () { pfOpen(); });

        pfInput.addEventListener('input', function () {
            clearTimeout(pfTimer);
            pfTimer = setTimeout(function () {
                if (!pfState.open) pfOpen();
                else pfRefresh();
            }, 80);
        });

        pfInput.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (!pfState.open) { pfOpen(); return; }
                if (pfState.results.length) {
                    pfState.activeIdx = (pfState.activeIdx + 1) % pfState.results.length;
                    pfRender();
                    pfScrollActive();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (!pfState.open) { pfOpen(); return; }
                if (pfState.results.length) {
                    var n = pfState.results.length;
                    pfState.activeIdx = (pfState.activeIdx - 1 + n) % n;
                    pfRender();
                    pfScrollActive();
                }
            } else if (e.key === 'Enter') {
                if (!pfState.open || pfState.activeIdx < 0) return;
                e.preventDefault();
                pfSelect(pfState.activeIdx, false);
            } else if (e.key === 'Tab') {
                if (!pfState.open || pfState.activeIdx < 0) return;
                e.preventDefault();
                pfSelect(pfState.activeIdx, true);
            } else if (e.key === '/') {
                if (!pfState.open) return;
                if (pfTryAutocomplete()) e.preventDefault();
            } else if (e.key === 'Escape') {
                if (pfState.open) {
                    e.preventDefault();
                    if (pfInput.value !== '') {
                        pfInput.value = '';
                        pfRefresh();
                    } else {
                        pfClose();
                        pfInput.blur();
                    }
                }
            }
        });

        pfResults.addEventListener('mousedown', function (e) {
            // mousedown so click happens before blur
            var li = e.target.closest('.jsonb-pf-result');
            if (!li) return;
            e.preventDefault();
            var idx = parseInt(li.getAttribute('data-pf-idx'), 10);
            pfSelect(idx, e.metaKey || e.ctrlKey);
        });

        pfResults.addEventListener('mousemove', function (e) {
            var li = e.target.closest('.jsonb-pf-result');
            if (!li) return;
            var idx = parseInt(li.getAttribute('data-pf-idx'), 10);
            if (idx === pfState.activeIdx) return;
            pfState.activeIdx = idx;
            pfRender();
        });

        pfClear.addEventListener('mousedown', function (e) {
            e.preventDefault();
            pfInput.value = '';
            pfClear.hidden = true;
            pfInput.focus();
            pfRefresh();
        });

        document.addEventListener('mousedown', function (e) {
            if (!pfState.open) return;
            if (pfWrap.contains(e.target)) return;
            pfClose();
        });

        // Cmd/Ctrl+P opens the pathfinder
        root.addEventListener('keydown', function (e) {
            if ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'P')) {
                e.preventDefault();
                pfInput.focus();
                pfInput.select();
            }
        });

        // Invalidate path index whenever focus or parse changes
        var origRender = render;
        render = function () {
            pfInvalidateIndex();
            origRender();
            if (pfState.open) pfRefresh();
        };

        parse();
        render();
    }

    function init() {
        document.querySelectorAll('.jsonb-wrap').forEach(attach);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
