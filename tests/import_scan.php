<?php

declare(strict_types=1);

$dir = __DIR__ . '/../assets/scripts';
$modules = [];
foreach (scandir($dir) ?: [] as $entry) {
    if (str_ends_with($entry, '.js')) {
        $modules[] = $dir . '/' . $entry;
    }
}

$exports = [];
foreach ($modules as $file) {
    $source = (string)file_get_contents($file);
    preg_match_all('/export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/', $source, $matches);
    foreach ($matches[1] as $name) {
        $exports[$name][] = basename($file);
    }
    preg_match_all('/export\s*\{([^}]*)\}/', $source, $blocks);
    foreach ($blocks[1] as $block) {
        foreach (explode(',', $block) as $piece) {
            $name = trim(explode(' as ', $piece)[1] ?? $piece);
            if ($name !== '') {
                $exports[$name][] = basename($file);
            }
        }
    }
}

$builtins = array_flip([
    'window', 'document', 'console', 'Math', 'JSON', 'Object', 'Array', 'Number', 'String', 'Boolean', 'Promise',
    'Map', 'Set', 'Date', 'Error', 'FormData', 'URL', 'Blob', 'File', 'Image', 'Audio', 'Uint8Array', 'Intl',
    'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'fetch', 'localStorage', 'sessionStorage', 'navigator', 'location', 'history', 'performance', 'Touch', 'TouchEvent',
    'MouseEvent', 'Event', 'CustomEvent', 'MutationObserver', 'IntersectionObserver', 'ResizeObserver', 'structuredClone',
    'parseInt', 'parseFloat', 'isNaN', 'encodeURIComponent', 'decodeURIComponent', 'btoa', 'atob', 'alert', 'confirm',
    'arguments', 'this', 'super', 'import', 'require', 'module', 'exports', 'globalThis', 'cv', 'ch', 'charAt',
]);

$problems = 0;
foreach ($modules as $file) {
    $name = basename($file);
    $source = (string)file_get_contents($file);
    $code = preg_replace('/^\s*import[\s\S]*?;\s*$/m', '', $source) ?? $source;
    preg_match_all('/import\s*\{([^}]*)\}\s*from/', $source, $imports);
    $imported = [];
    foreach ($imports[1] as $block) {
        foreach (explode(',', $block) as $piece) {
            $piece = trim($piece);
            if ($piece !== '') {
                $imported[trim(explode(' as ', $piece)[1] ?? $piece)] = true;
            }
        }
    }
    preg_match_all('/import\s+\*\s+as\s+([A-Za-z_$][\w$]*)/', $source, $namespaces);
    foreach ($namespaces[1] as $ns) {
        $imported[$ns] = true;
    }
    preg_match_all('/^\s*(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/m', $source, $locals);
    foreach ($locals[1] as $local) {
        $imported[$local] = true;
    }
    preg_match_all('/(?:const|let|var)\s*\{([^}]*)\}/', $source, $destructured);
    preg_match_all('/\(\s*\{([^}]*)\}\s*\)\s*=>/', $source, $callbacks);
    foreach (array_merge($destructured[1], $callbacks[1]) as $block) {
        foreach (explode(',', $block) as $piece) {
            $bound = trim(explode(':', $piece)[0]);
            if ($bound !== '') {
                $imported[$bound] = true;
            }
        }
    }
    foreach ($exports as $exported => $owners) {
        if (in_array($name, $owners, true) || isset($imported[$exported]) || isset($builtins[$exported])) {
            continue;
        }
        if (preg_match('/(^|[^\w$.\/-])' . preg_quote($exported, '/') . '\s*[(.]/', $code) === 1) {
            echo $name . ': 用了 ' . $exported . ' 但没 import（来自 ' . implode('/', $owners) . '）' . PHP_EOL;
            $problems += 1;
        }
    }
}

echo $problems === 0 ? 'OK 没有发现漏 import' . PHP_EOL : ('共 ' . $problems . ' 处可疑' . PHP_EOL);
