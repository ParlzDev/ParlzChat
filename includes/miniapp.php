<?php

declare(strict_types=1);

const MINIAPP_TAGS = ['div', 'span', 'p', 'h1', 'h2', 'h3', 'b', 'i', 'u', 'em', 'strong', 'ul', 'ol', 'li', 'img', 'a', 'br', 'hr', 'input', 'button', 'label', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'code', 'pre', 'small', 'section', 'header', 'footer', 'main'];
const MINIAPP_ATTRS = ['class', 'id', 'style', 'src', 'alt', 'title', 'href', 'type', 'value', 'placeholder', 'data-act', 'colspan', 'rowspan', 'width', 'height'];
const MINIAPP_FUNCS = ['count', 'strlen', 'mb_strlen', 'strtoupper', 'strtolower', 'substr', 'implode', 'explode', 'round', 'max', 'min', 'date', 'number_format', 'trim', 'sprintf'];

function miniapp_clean_html(string $html): string
{
    $html = preg_replace('#<(script|style|iframe|object|embed|form|link|meta|base)\b[\s\S]*?</\1>#i', '', $html) ?? $html;
    $html = preg_replace('#<(script|style|iframe|object|embed|form|link|meta|base)\b[^>]*?/?>#i', '', $html) ?? $html;
    $html = preg_replace('#\son[a-z]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)#i', '', $html) ?? $html;
    $html = preg_replace('#(href|src)\s*=\s*("|\')\s*javascript:[^"\']*\2#i', '$1="#"', $html) ?? $html;
    $html = preg_replace_callback('#<\s*(/?)\s*([a-zA-Z0-9]+)((?:\s+[^<>]*?)?)\s*(/?)\s*>#', static function (array $m): string {
        $tag = strtolower($m[2]);
        if (!in_array($tag, MINIAPP_TAGS, true)) {
            return '';
        }
        if ($m[1] === '/') {
            return '</' . $tag . '>';
        }
        $attrs = '';
        if (preg_match_all('#([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s>]+))#', $m[2], $found, PREG_SET_ORDER) > 0) {
            foreach ($found as $item) {
                $name = strtolower($item[1]);
                if (!in_array($name, MINIAPP_ATTRS, true)) {
                    continue;
                }
                $value = $item[2] !== '' ? $item[2] : ($item[3] !== '' ? $item[3] : $item[4]);
                if (($name === 'src' || $name === 'href') && preg_match('#^\s*(javascript|data):#i', $value) === 1) {
                    continue;
                }
                $attrs .= ' ' . $name . '="' . htmlspecialchars($value, ENT_QUOTES, 'UTF-8') . '"';
            }
        }
        return '<' . $tag . $attrs . '>';
    }, $html) ?? $html;
    return trim($html);
}

function miniapp_clean_css(string $css): string
{
    $css = preg_replace('#@(import|charset|namespace|supports|media)[^;{]*[;{]#i', '', $css) ?? $css;
    $css = preg_replace('#expression\s*\(#i', 'none(', $css) ?? $css;
    $css = preg_replace('#url\s*\(\s*("|\')?\s*(https?:|//)[^)]*\)#i', 'none', $css) ?? $css;
    $css = preg_replace('#javascript\s*:#i', '', $css) ?? $css;
    $css = preg_replace('#behavior\s*:#i', '', $css) ?? $css;
    return trim($css);
}

function miniapp_clean_js(string $js): string
{
    $banned = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'import(', 'eval', 'Function(', 'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'window.top', 'window.parent', 'top.location', 'parent.', 'navigator.sendBeacon', 'Worker('];
    foreach ($banned as $needle) {
        $js = str_replace($needle, 'void 0/*', $js);
    }
    $js = str_replace('*/(', '*/ (', $js);
    return trim($js);
}

function miniapp_tokenize(string $code): array
{
    $tokens = [];
    $length = strlen($code);
    $index = 0;
    while ($index < $length) {
        $char = $code[$index];
        if (ctype_space($char)) {
            $index += 1;
            continue;
        }
        if ($char === '/' && ($code[$index + 1] ?? '') === '/') {
            $index = strpos($code, "\n", $index) ?: $length;
            continue;
        }
        if ($char === '"' || $char === "'") {
            $quote = $char;
            $value = '';
            $index += 1;
            while ($index < $length && $code[$index] !== $quote) {
                if ($code[$index] === '\\' && $index + 1 < $length) {
                    $index += 1;
                }
                $value .= $code[$index];
                $index += 1;
            }
            $index += 1;
            $tokens[] = ['type' => 'string', 'value' => $value];
            continue;
        }
        if (ctype_digit($char)) {
            $value = '';
            while ($index < $length && (ctype_digit($code[$index]) || $code[$index] === '.')) {
                $value .= $code[$index];
                $index += 1;
            }
            $tokens[] = ['type' => 'number', 'value' => (float)$value];
            continue;
        }
        if ($char === '$') {
            $value = '';
            $index += 1;
            while ($index < $length && (ctype_alnum($code[$index]) || $code[$index] === '_')) {
                $value .= $code[$index];
                $index += 1;
            }
            $tokens[] = ['type' => 'var', 'value' => $value];
            continue;
        }
        if (ctype_alpha($char) || $char === '_') {
            $value = '';
            while ($index < $length && (ctype_alnum($code[$index]) || $code[$index] === '_')) {
                $value .= $code[$index];
                $index += 1;
            }
            $tokens[] = ['type' => 'word', 'value' => strtolower($value)];
            continue;
        }
        $two = substr($code, $index, 2);
        if (in_array($two, ['==', '!=', '>=', '<=', '&&', '||', '=>', '..'], true)) {
            $tokens[] = ['type' => 'op', 'value' => $two];
            $index += 2;
            continue;
        }
        $tokens[] = ['type' => 'op', 'value' => $char];
        $index += 1;
    }
    return $tokens;
}

function miniapp_eval(array $tokens, int &$pos, array &$vars)
{
    $value = miniapp_expr($tokens, $pos, $vars);
    while ($pos < count($tokens)) {
        $token = $tokens[$pos];
        if ($token['type'] === 'op' && in_array($token['value'], ['==', '!=', '>', '<', '>=', '<=', '&&', '||'], true)) {
            $pos += 1;
            $right = miniapp_expr($tokens, $pos, $vars);
            switch ($token['value']) {
                case '==':
                    $value = $value == $right;
                    break;
                case '!=':
                    $value = $value != $right;
                    break;
                case '>':
                    $value = $value > $right;
                    break;
                case '<':
                    $value = $value < $right;
                    break;
                case '>=':
                    $value = $value >= $right;
                    break;
                case '<=':
                    $value = $value <= $right;
                    break;
                case '&&':
                    $value = $value && $right;
                    break;
                case '||':
                    $value = $value || $right;
                    break;
            }
            continue;
        }
        break;
    }
    return $value;
}

function miniapp_expr(array $tokens, int &$pos, array &$vars)
{
    if ($pos >= count($tokens)) {
        return '';
    }
    $token = $tokens[$pos];
    $value = null;
    if ($token['type'] === 'op' && $token['value'] === '!') {
        $pos += 1;
        return !miniapp_expr($tokens, $pos, $vars);
    }
    if ($token['type'] === 'op' && $token['value'] === '(') {
        $pos += 1;
        $value = miniapp_eval($tokens, $pos, $vars);
        if ($pos < count($tokens) && $tokens[$pos]['value'] === ')') {
            $pos += 1;
        }
    } elseif ($token['type'] === 'number' || $token['type'] === 'string') {
        $value = $token['value'];
        $pos += 1;
    } elseif ($token['type'] === 'var') {
        $value = $vars[$token['value']] ?? null;
        $pos += 1;
        if ($pos < count($tokens) && $tokens[$pos]['type'] === 'op' && $tokens[$pos]['value'] === '[') {
            $pos += 1;
            $key = miniapp_eval($tokens, $pos, $vars);
            if ($pos < count($tokens) && $tokens[$pos]['value'] === ']') {
                $pos += 1;
            }
            $value = is_array($value) ? ($value[$key] ?? null) : null;
        }
    } elseif ($token['type'] === 'word') {
        $name = $token['value'];
        $pos += 1;
        if (in_array($name, ['true', 'false', 'null'], true)) {
            $value = $name === 'true' ? true : ($name === 'false' ? false : null);
        } elseif ($pos < count($tokens) && $tokens[$pos]['value'] === '(' && in_array($name, MINIAPP_FUNCS, true)) {
            $pos += 1;
            $args = [];
            while ($pos < count($tokens) && $tokens[$pos]['value'] !== ')') {
                $args[] = miniapp_eval($tokens, $pos, $vars);
                if ($pos < count($tokens) && $tokens[$pos]['value'] === ',') {
                    $pos += 1;
                }
            }
            if ($pos < count($tokens)) {
                $pos += 1;
            }
            $value = miniapp_call($name, $args);
        } else {
            $value = $name;
        }
    } elseif ($token['type'] === 'op' && $token['value'] === '[') {
        $pos += 1;
        $items = [];
        while ($pos < count($tokens) && $tokens[$pos]['value'] !== ']') {
            $items[] = miniapp_eval($tokens, $pos, $vars);
            if ($pos < count($tokens) && $tokens[$pos]['value'] === ',') {
                $pos += 1;
            }
        }
        if ($pos < count($tokens)) {
            $pos += 1;
        }
        $value = $items;
    }
    while ($pos < count($tokens)) {
        $token = $tokens[$pos];
        if ($token['type'] !== 'op' || !in_array($token['value'], ['+', '-', '*', '/', '.'], true)) {
            break;
        }
        $pos += 1;
        $right = miniapp_expr($tokens, $pos, $vars);
        if ($token['value'] === '.') {
            $value = miniapp_str($value) . miniapp_str($right);
        } elseif ($token['value'] === '+') {
            $value = (is_numeric($value) && is_numeric($right)) ? ($value + $right) : (miniapp_str($value) . miniapp_str($right));
        } elseif ($token['value'] === '-') {
            $value = (float)$value - (float)$right;
        } elseif ($token['value'] === '*') {
            $value = (float)$value * (float)$right;
        } else {
            $divisor = (float)$right;
            $value = $divisor == 0.0 ? 0 : (float)$value / $divisor;
        }
    }
    return $value;
}

function miniapp_str($value): string
{
    if (is_bool($value)) {
        return $value ? '1' : '';
    }
    if (is_array($value)) {
        return implode(', ', array_map('miniapp_str', $value));
    }
    return (string)($value ?? '');
}

function miniapp_call(string $name, array $args)
{
    $first = $args[0] ?? '';
    switch ($name) {
        case 'count':
            return is_array($first) ? count($first) : miniapp_mb_len(miniapp_str($first));
        case 'strlen':
            return strlen(miniapp_str($first));
        case 'mb_strlen':
            return miniapp_mb_len(miniapp_str($first));
        case 'strtoupper':
            return strtoupper(miniapp_str($first));
        case 'strtolower':
            return strtolower(miniapp_str($first));
        case 'substr':
            return mb_substr(miniapp_str($first), (int)($args[1] ?? 0), isset($args[2]) ? (int)$args[2] : null, 'UTF-8');
        case 'trim':
            return trim(miniapp_str($first));
        case 'implode':
            return is_array($args[1] ?? null) ? implode(miniapp_str($first), $args[1]) : '';
        case 'explode':
            return is_array($args[1] ?? null) ? [] : explode(miniapp_str($first), miniapp_str($args[1] ?? ''));
        case 'round':
            return round((float)$first, (int)($args[1] ?? 0));
        case 'max':
            return is_array($first) ? max(array_map('floatval', $first)) : max(array_map('floatval', $args));
        case 'min':
            return is_array($first) ? min(array_map('floatval', $first)) : min(array_map('floatval', $args));
        case 'date':
            return date(miniapp_str($first) === '' ? 'Y-m-d' : miniapp_str($first));
        case 'number_format':
            return number_format((float)$first, (int)($args[1] ?? 0));
        case 'sprintf':
            $format = miniapp_str($first);
            $rest = array_slice($args, 1);
            return @vsprintf($format, $rest);
    }
    return '';
}

function miniapp_mb_len(string $text): int
{
    return function_exists('mb_strlen') ? (int)mb_strlen($text, 'UTF-8') : strlen($text);
}

function miniapp_run_pphp(string $code, array $vars): array
{
    $tokens = miniapp_tokenize($code);
    $pos = 0;
    $out = '';
    $count = count($tokens);
    while ($pos < $count) {
        $token = $tokens[$pos];
        if ($token['type'] === 'var' && ($tokens[$pos + 1]['value'] ?? '') === '=') {
            $name = $token['value'];
            $pos += 2;
            $vars[$name] = miniapp_eval($tokens, $pos, $vars);
            if (($tokens[$pos]['value'] ?? '') === ';') {
                $pos += 1;
            }
            continue;
        }
        if ($token['type'] === 'word' && $token['value'] === 'echo') {
            $pos += 1;
            $out .= miniapp_str(miniapp_eval($tokens, $pos, $vars));
            if (($tokens[$pos]['value'] ?? '') === ';') {
                $pos += 1;
            }
            continue;
        }
        if ($token['type'] === 'word' && $token['value'] === 'if') {
            $pos += 1;
            $condition = miniapp_block_condition($tokens, $pos, $vars);
            $body = miniapp_block_body($tokens, $pos);
            $elseBody = '';
            if (($tokens[$pos]['type'] ?? '') === 'word' && ($tokens[$pos]['value'] ?? '') === 'else') {
                $pos += 1;
                $elseBody = miniapp_block_body($tokens, $pos);
            }
            $chunk = $condition ? $body : $elseBody;
            $out .= miniapp_str(miniapp_run_pphp($chunk, $vars)['out']);
            continue;
        }
        if ($token['type'] === 'word' && $token['value'] === 'foreach') {
            $pos += 1;
            $subject = miniapp_block_condition($tokens, $pos, $vars);
            $body = miniapp_block_body($tokens, $pos);
            $asName = '';
            if (($tokens[$pos]['type'] ?? '') === 'word' && ($tokens[$pos]['value'] ?? '') === 'as') {
                $pos += 1;
                $asName = (string)($tokens[$pos]['value'] ?? '');
                $pos += 1;
            }
            $items = is_array($subject) ? $subject : [];
            foreach ($items as $item) {
                $scope = $vars;
                if ($asName !== '') {
                    $scope[$asName] = $item;
                }
                $out .= miniapp_str(miniapp_run_pphp($body, $scope)['out']);
            }
            continue;
        }
        $pos += 1;
    }
    return ['out' => $out, 'vars' => $vars];
}

function miniapp_block_condition(array $tokens, int &$pos, array &$vars)
{
    $value = '';
    if (($tokens[$pos]['value'] ?? '') === '(') {
        $pos += 1;
        $value = miniapp_eval($tokens, $pos, $vars);
        if (($tokens[$pos]['value'] ?? '') === ')') {
            $pos += 1;
        }
        return $value;
    }
    return '';
}

function miniapp_block_body(array $tokens, int &$pos): string
{
    $depth = 0;
    $start = $pos;
    $end = $pos;
    $count = count($tokens);
    for ($i = $start; $i < $count; $i += 1) {
        $value = $tokens[$i]['value'] ?? '';
        if ($value === '{') {
            $depth += 1;
            if ($depth === 1) {
                $start = $i + 1;
            }
            continue;
        }
        if ($value === '}') {
            $depth -= 1;
            if ($depth === 0) {
                $end = $i;
                break;
            }
        }
    }
    $pos = $end + 1;
    return miniapp_join_tokens(array_slice($tokens, $start, max(0, $end - $start)));
}

function miniapp_join_tokens(array $tokens): string
{
    $out = '';
    foreach ($tokens as $token) {
        if ($token['type'] === 'string') {
            $out .= '"' . str_replace('"', '\"', $token['value']) . '"';
        } elseif ($token['type'] === 'number') {
            $out .= (string)$token['value'];
        } elseif ($token['type'] === 'var') {
            $out .= '$' . $token['value'];
        } else {
            $out .= $token['value'];
        }
        $out .= ' ';
    }
    return $out;
}

function miniapp_render(array $files, array $vars): string
{
    $pphp = (string)($files['pphp'] ?? '');
    $result = $pphp === '' ? ['out' => '', 'vars' => $vars] : miniapp_run_pphp($pphp, $vars);
    $vars = $result['vars'];
    $html = (string)($files['phtml'] ?? '');
    $html = preg_replace_callback('#\{\{\s*(.+?)\s*\}\}#', static function (array $m) use ($vars): string {
        $expr = trim((string)$m[1]);
        $path = explode('.', ltrim($expr, '$'));
        $value = $vars[$path[0]] ?? null;
        if ($value === null && !isset($vars[$path[0]])) {
            return '';
        }
        foreach (array_slice($path, 1) as $segment) {
            $value = is_array($value) ? ($value[$segment] ?? null) : null;
        }
        return miniapp_str($value);
    }, $html) ?? $html;
    return miniapp_clean_html($html);
}
