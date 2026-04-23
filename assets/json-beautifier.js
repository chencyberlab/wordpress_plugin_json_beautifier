(function () {
    'use strict';

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function indentStr(n, width) { return new Array(n * width + 1).join(' '); }

    function primitiveHtml(value) {
        if (value === null)             return '<span class="tok-null">null</span>';
        if (typeof value === 'string')  return '<span class="tok-string">' + escapeHtml(JSON.stringify(value)) + '</span>';
        if (typeof value === 'number')  return '<span class="tok-number">' + escapeHtml(String(value)) + '</span>';
        if (typeof value === 'boolean') return '<span class="tok-bool">' + String(value) + '</span>';
        return escapeHtml(String(value));
    }

    function renderJson(value, depth, keyLabel, trailingComma, indentWidth, ctr, path) {
        var pad   = indentStr(depth, indentWidth);
        var key   = keyLabel !== null
            ? '<span class="tok-key">' + escapeHtml(JSON.stringify(keyLabel)) + '</span>: '
            : '';
        var comma = trailingComma ? ',' : '';

        if (value === null || typeof value !== 'object') {
            return '<div class="jb-line" data-ln="' + (ctr.n++) + '">' + pad + key + primitiveHtml(value) + comma + '</div>';
        }

        var isArr  = Array.isArray(value);
        var keys   = isArr ? value.map(function (_, i) { return i; }) : Object.keys(value);
        var openB  = isArr ? '[' : '{';
        var closeB = isArr ? ']' : '}';

        if (keys.length === 0) {
            return '<div class="jb-line" data-ln="' + (ctr.n++) + '">' + pad + key + openB + closeB + comma + '</div>';
        }

        var unit     = keys.length === 1 ? (isArr ? ' item' : ' field') : (isArr ? ' items' : ' fields');
        var summary  = keys.length + unit;
        var headerLn = ctr.n++;
        var children = keys.map(function (k, i) {
            return renderJson(value[k], depth + 1, isArr ? null : k, i < keys.length - 1, indentWidth, ctr, childPath(path, k, isArr));
        }).join('');
        var footerLn = ctr.n++;

        return '<div class="jb-block" data-path="' + escapeHtml(path) + '">' +
            '<div class="jb-line jb-header" data-ln="' + headerLn + '">' + pad +
                '<button type="button" class="jb-toggle" aria-expanded="true" aria-label="Collapse">▾</button>' +
                key + openB +
                '<span class="jb-ellipsis"> ... ' + summary + ' ' + closeB + comma + '</span>' +
            '</div>' +
            '<div class="jb-children">' + children + '</div>' +
            '<div class="jb-line jb-footer" data-ln="' + footerLn + '">' + pad + closeB + comma + '</div>' +
        '</div>';
    }

    function formatValue(v) {
        if (v === null) return 'null';
        if (typeof v === 'string') return v;
        return String(v);
    }

    function childPath(parentPath, key, isArr) {
        if (isArr) return parentPath + '[' + key + ']';
        return parentPath ? parentPath + '.' + key : String(key);
    }

    function renderNode(label, value, path) {
        var pathAttr = ' data-path="' + escapeHtml(path) + '"';
        if (value !== null && typeof value === 'object') {
            var isArr = Array.isArray(value);
            var keys  = isArr ? value.map(function (_, i) { return i; }) : Object.keys(value);
            var hint  = isArr
                ? (keys.length ? '[' + keys.length + ']' : '[ ]')
                : (keys.length ? '{' + keys.length + '}' : '{ }');

            var childrenHtml = keys.map(function (k) {
                var childLabel = isArr ? '[' + k + ']' : k;
                return renderNode(childLabel, value[k], childPath(path, k, isArr));
            }).join('');

            var header = '<div class="fbranch"><span class="fk">' + escapeHtml(label) +
                         '</span><span class="fhint">' + hint + '</span></div>';

            return '<li class="fnode"' + pathAttr + '>' + header +
                   (keys.length ? '<ul class="ftree">' + childrenHtml + '</ul>' : '') +
                   '</li>';
        }

        return '<li class="fleaf"' + pathAttr + '><span class="fk">' + escapeHtml(label) +
               '</span><span class="fv">' + escapeHtml(formatValue(value)) + '</span></li>';
    }

    function renderTree(parsed) {
        if (parsed === null || typeof parsed !== 'object') {
            return renderNode('(root)', parsed, '');
        }
        var isArr = Array.isArray(parsed);
        var keys  = isArr ? parsed.map(function (_, i) { return i; }) : Object.keys(parsed);
        if (!keys.length) {
            return '<li class="fleaf" data-path=""><span class="fk">(root)</span><span class="fv">' +
                   (isArr ? '[ ]' : '{ }') + '</span></li>';
        }
        return keys.map(function (k) {
            var label = isArr ? '[' + k + ']' : k;
            return renderNode(label, parsed[k], childPath('', k, isArr));
        }).join('');
    }

    function attach(root) {
        var indent   = parseInt(root.getAttribute('data-indent'), 10) || 2;
        var flattenOn = root.getAttribute('data-flatten') === 'true';
        var input    = root.querySelector('.jsonb-input');
        var output   = root.querySelector('.jsonb-output');
        var status   = root.querySelector('.jsonb-status');
        var flatList = root.querySelector('.jsonb-flat-list');

        function render() {
            var raw = input.value;

            if (raw.trim() === '') {
                output.innerHTML = '';
                if (status) { status.textContent = ''; status.className = 'jsonb-status'; }
                if (flatList) flatList.innerHTML = '';
                return;
            }

            try {
                var parsed = JSON.parse(raw);
                output.innerHTML = renderJson(parsed, 0, null, false, indent, { n: 1 }, '');

                if (status) {
                    status.textContent = 'Valid JSON';
                    status.className = 'jsonb-status is-ok';
                }

                if (flattenOn && flatList) {
                    flatList.innerHTML = renderTree(parsed);
                }
            } catch (e) {
                if (status) {
                    status.textContent = e.message;
                    status.className = 'jsonb-status is-error';
                }
            }
        }

        input.addEventListener('input', render);
        render();

        function syncFlat(path, collapsed) {
            if (!flatList) return;
            if (path === '') {
                flatList.classList.toggle('is-collapsed', collapsed);
                return;
            }
            var sel = '[data-path="' + (window.CSS && CSS.escape ? CSS.escape(path) : path.replace(/"/g, '\\"')) + '"]';
            var node = flatList.querySelector('.fnode' + sel);
            if (node) node.classList.toggle('is-collapsed', collapsed);
        }

        output.addEventListener('click', function (e) {
            var btn = e.target.closest('.jb-toggle');
            if (!btn) return;
            var block = btn.closest('.jb-block');
            if (!block) return;
            var collapsed = block.classList.toggle('is-collapsed');
            btn.textContent = collapsed ? '▸' : '▾';
            btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            btn.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse');
            syncFlat(block.getAttribute('data-path') || '', collapsed);
        });

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
                if (flatList) {
                    flatList.querySelectorAll('.fnode').forEach(function (n) {
                        n.classList.toggle('is-collapsed', collapse);
                    });
                    flatList.classList.toggle('is-collapsed', collapse);
                }
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
            root.querySelectorAll('.is-expanded').forEach(function (el) {
                el.classList.remove('is-expanded');
                var btn = el.querySelector('.jsonb-expand');
                if (btn) { btn.textContent = '⛶'; btn.setAttribute('aria-label', 'Expand'); btn.setAttribute('title', 'Expand'); }
            });
            document.body.classList.remove('jsonb-locked');
        });
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
