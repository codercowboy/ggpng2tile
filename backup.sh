#!/bin/bash

# backup.sh - a fairly generic backup script from ccgallery project
# Copyright 2026, Jason Baker (jason@onejasonforsale.com)
# Github for ccgallery project: https://github.com/codercowboy/ccgallery

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FOLDER_BASENAME=`basename "${SCRIPT_DIR}"`
DATE=$(date +"%Y%m%d-%H%M%S")
FILE="${FOLDER_BASENAME}-${DATE}.tar.gz"
tar -cvzf "../${FILE}" -C .. "${SCRIPT_DIR}"
FILE_SIZE=`du -sh "../${FILE}" | awk '{print $1}'`
echo "backed up to ${FILE}, size: ${FILE_SIZE}"
