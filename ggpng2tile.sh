#!/bin/bash

SCRIPT_HOME="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "${SCRIPT_HOME}/src/ggpng2tile.js" ${@}