#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
: "${FTP_HOST:?set FTP_HOST}"
: "${FTP_USER:?set FTP_USER}"
: "${FTP_PASS:?set FTP_PASS}"
REMOTE="${FTP_REMOTE:-shopee.sogiin6868.com}"
lftp -c "
set ssl:verify-certificate no
set ftp:passive-mode true
set net:timeout 120
set net:max-retries 5
open -u \"${FTP_USER}\",\"${FTP_PASS}\" ftp://${FTP_HOST}
cd ${REMOTE}
mirror -R --verbose --parallel=1 --exclude config.php --exclude bootstrap.php ${ROOT}/php/ .
bye
"
