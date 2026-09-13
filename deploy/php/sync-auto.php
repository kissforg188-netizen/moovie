<?php
header('Content-Type: text/plain; charset=utf-8');
$branch = preg_replace('/[^a-zA-Z0-9._\\/-]/', '', (string)($_GET['branch'] ?? 'cursor/affiliate-4fee')) ?: 'main';
$b = 'https://raw.githubusercontent.com/kissforg188-netizen/moovie/' . $branch . '/deploy/php/';
$fs = [
  'guide/index.html','guide/index.php',
  'guide/screens/guide-01-dashboard.png',
  'guide/screens/guide-02-automation-center.png',
  'guide/screens/guide-03-morning-done.png',
  'guide/screens/guide-04-import.png',
  'guide/screens/guide-05-content-pack.png',
  'guide/screens/guide-06-calendar.png',
  'guide/screens/guide-07-approved.png',
  'guide/screens/guide-08-results.png',
  'guide/screens/guide-09-evening.png',
  'guide/screens/guide-10-handbook.png',
  'lib/automation.php','lib/adapters.php','lib/app.php','api.php','index.php','assets/app.css','assets/app.js',
];
$o = 0;
foreach ($fs as $f) {
  $u = $b . implode('/', array_map('rawurlencode', explode('/', $f)));
  $ch = curl_init($u);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => 1, CURLOPT_FOLLOWLOCATION => 1, CURLOPT_TIMEOUT => 120, CURLOPT_SSL_VERIFYPEER => 0]);
  $d = curl_exec($ch);
  $c = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if ($c >= 400 || $d === false || $d === '') { echo "FAIL $f\n"; continue; }
  $t = __DIR__ . '/' . $f;
  $dir = dirname($t);
  if (!is_dir($dir)) mkdir($dir, 0755, true);
  file_put_contents($t, $d);
  echo "OK $f " . strlen($d) . "\n";
  $o++;
}
echo "BRANCH $branch\n";
echo "DONE $o/" . count($fs) . "\n";
