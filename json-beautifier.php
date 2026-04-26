<?php
/**
 * Plugin Name: JSON Beautifier
 * Description: Shortcode [json_beautifier] that renders a live JSON formatter with focus/zoom, depth limiting, search and click-to-copy JSONPath.
 * Version:     2.0.0
 * Author:      Chen
 * License:     GPL-2.0-or-later
 * Text Domain: json-beautifier
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'JSONB_VERSION', '2.0.0' );
define( 'JSONB_URL', plugin_dir_url( __FILE__ ) );
define( 'JSONB_PATH', plugin_dir_path( __FILE__ ) );

function jsonb_register_assets() {
    wp_register_style(
        'json-beautifier',
        JSONB_URL . 'assets/json-beautifier.css',
        array(),
        JSONB_VERSION
    );

    wp_register_script(
        'json-beautifier',
        JSONB_URL . 'assets/json-beautifier.js',
        array(),
        JSONB_VERSION,
        true
    );
}
add_action( 'wp_enqueue_scripts', 'jsonb_register_assets' );

function jsonb_shortcode( $atts ) {
    $atts = shortcode_atts(
        array(
            'height'  => '400px',
            'indent'  => '2',
            'flatten' => 'true',
        ),
        $atts,
        'json_beautifier'
    );

    wp_enqueue_style( 'json-beautifier' );
    wp_enqueue_script( 'json-beautifier' );

    $instance_id = 'jsonb-' . wp_generate_uuid4();
    $height      = esc_attr( $atts['height'] );
    $indent      = (int) $atts['indent'];
    $flatten     = filter_var( $atts['flatten'], FILTER_VALIDATE_BOOLEAN );

    $sample = "{\n  \"name\": \"Ada Lovelace\",\n  \"role\": \"engineer\",\n  \"active\": true,\n  \"skills\": [\"math\", \"code\"],\n  \"team\": {\n    \"name\": \"Analytical Engine\",\n    \"members\": [\n      {\"id\": 1, \"name\": \"Charles\"},\n      {\"id\": 2, \"name\": \"Ada\"}\n    ]\n  }\n}";

    ob_start();
    ?>
    <div class="jsonb-wrap" id="<?php echo esc_attr( $instance_id ); ?>"
         data-indent="<?php echo esc_attr( $indent ); ?>"
         data-flatten="<?php echo $flatten ? 'true' : 'false'; ?>">
        <div class="jsonb-top" style="--jsonb-height: <?php echo $height; ?>;">
            <div class="jsonb-pane" data-section="input">
                <div class="jsonb-label-row">
                    <label class="jsonb-label" for="<?php echo esc_attr( $instance_id ); ?>-input">Raw JSON</label>
                    <button type="button" class="jsonb-expand" aria-label="Expand" title="Expand">⛶</button>
                </div>
                <textarea id="<?php echo esc_attr( $instance_id ); ?>-input"
                          class="jsonb-input"
                          spellcheck="false"
                          placeholder="Paste JSON here..."><?php echo esc_textarea( $sample ); ?></textarea>
            </div>
        </div>
        <div class="jsonb-search-bar" role="search">
            <input type="search"
                   class="jsonb-search"
                   placeholder="Search keys and values..."
                   aria-label="Search keys and values" />
            <span class="jsonb-match-count" aria-live="polite"></span>
            <button type="button" class="jsonb-match-prev" aria-label="Previous match" title="Previous match (Shift+Enter)" disabled>↑</button>
            <button type="button" class="jsonb-match-next" aria-label="Next match" title="Next match (Enter)" disabled>↓</button>
        </div>
        <div class="jsonb-panes" style="--jsonb-height: <?php echo $height; ?>;">
            <div class="jsonb-pane" data-section="output">
                <div class="jsonb-label-row">
                    <span class="jsonb-label">Beautified</span>
                    <span class="jsonb-status" aria-live="polite"></span>
                    <button type="button" class="jsonb-foldall" data-action="collapse" aria-label="Collapse all" title="Collapse all">−</button>
                    <button type="button" class="jsonb-foldall" data-action="expand" aria-label="Expand all" title="Expand all">+</button>
                    <button type="button" class="jsonb-expand" aria-label="Expand" title="Expand">⛶</button>
                </div>
                <div class="jsonb-output-controls">
                    <nav class="jsonb-breadcrumbs" aria-label="JSON focus path">
                        <button type="button" class="jsonb-bc-reset" aria-label="Reset focus to root" title="Reset to root">⌂</button>
                        <ol class="jsonb-bc-list"></ol>
                    </nav>
                    <label class="jsonb-depth-label">
                        <span class="jsonb-depth-text">Depth</span>
                        <select class="jsonb-depth-select" aria-label="Render depth from focus">
                            <option value="0" selected>All</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                            <option value="6">6</option>
                            <option value="7">7</option>
                            <option value="8">8</option>
                            <option value="9">9</option>
                            <option value="10">10</option>
                        </select>
                    </label>
                </div>
                <div class="jsonb-output" aria-live="polite"></div>
            </div>
            <?php if ( $flatten ) : ?>
                <div class="jsonb-flat" data-section="flat">
                    <div class="jsonb-label-row">
                        <span class="jsonb-label">Flattened values</span>
                        <span class="jsonb-flat-count" aria-live="polite"></span>
                        <button type="button" class="jsonb-expand" aria-label="Expand" title="Expand">⛶</button>
                    </div>
                    <ul class="jsonb-flat-list"></ul>
                </div>
            <?php endif; ?>
        </div>
        <div class="jsonb-toast" role="status" aria-live="polite"></div>
    </div>
    <?php
    return ob_get_clean();
}
add_shortcode( 'json_beautifier', 'jsonb_shortcode' );
