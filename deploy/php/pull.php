<?php
declare(strict_types=1);
header('Content-Type: text/plain; charset=utf-8');
// Default branch for raw sync — override with ?branch=...
$branch = preg_replace('/[^a-zA-Z0-9._\\/-]/', '', (string)($_GET['branch'] ?? 'cursor/affiliate-b1cd')) ?: 'main';
$base = 'https://raw.githubusercontent.com/kissforg188-netizen/moovie/' . $branch . '/deploy/php/';
$files = [
  'api.php','index.php','install.php','config.example.php','.htaccess',
  'lib/app.php','lib/install.php','lib/automation.php','lib/adapters.php',
  'assets/app.css','assets/app.js',
  'guide/index.html',
  'assets/products/fan.svg','assets/products/sunscreen.svg','assets/products/bottle.svg',
  'assets/products/mousepad.svg','assets/products/cablebox.svg','assets/products/ringlight.svg',
  'assets/products/bag.svg','assets/products/trimmer.svg',
];
$ok=0;
foreach ($files as $rel) {
  $parts = array_map('rawurlencode', explode('/', $rel));
  $url = $base . implode('/', $parts);
  $ctx = stream_context_create(['http'=>['timeout'=>60],'ssl'=>['verify_peer'=>false,'verify_peer_name'=>false]]);
  $bin = @file_get_contents($url, false, $ctx);
  if ($bin === false || $bin === '') {
    if (function_exists('curl_init')) {
      $ch=curl_init($url);
      curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_FOLLOWLOCATION=>true,CURLOPT_TIMEOUT=>60,CURLOPT_SSL_VERIFYPEER=>false]);
      $bin=curl_exec($ch);
      $code=curl_getinfo($ch,CURLINFO_HTTP_CODE);
      curl_close($ch);
      if ($code>=400) $bin=false;
    }
  }
  if ($bin === false || $bin === '') { echo "FAIL $rel\n"; continue; }
  if ($rel === 'config.php' && is_file(__DIR__.'/config.php')) { echo "SKIP config.php (keep server secrets)\n"; continue; }
  $target = __DIR__ . '/' . $rel;
  $dir = dirname($target);
  if (!is_dir($dir)) mkdir($dir, 0755, true);
  file_put_contents($target, $bin);
  echo 'OK ' . $rel . ' (' . strlen($bin) . ")\n";
  $ok++;
}
echo "BRANCH $branch\n";
echo "DONE $ok/" . count($files) . "\n";
