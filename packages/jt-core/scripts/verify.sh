#!/bin/sh

set -eu

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)
repo_dir=$(CDPATH= cd "$script_dir/.." && pwd)

. "$script_dir/env.sh"
cd "$repo_dir"

cargo test
cargo build --target wasm32-unknown-unknown
node conformance/run_js.mjs > /tmp/js_out.json
cargo run --release --bin conformance > /tmp/rs_out.json
node conformance/diff.mjs /tmp/js_out.json /tmp/rs_out.json
