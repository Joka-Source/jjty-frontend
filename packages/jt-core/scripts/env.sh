#!/bin/sh

# This file is intended to be sourced. Toolchain discovery runs in the
# command-substitution subshell so PATH is the only caller state it changes.

if PATH=$(
    jt_core_original_path=${PATH:-}
    jt_core_rust_bin=

    if command -v rustup >/dev/null 2>&1; then
        jt_core_cargo_path=$(rustup which cargo 2>/dev/null || true)
        if [ -n "$jt_core_cargo_path" ] && [ -x "$jt_core_cargo_path" ]; then
            jt_core_rust_bin=${jt_core_cargo_path%/*}
        fi
    fi

    if [ -z "$jt_core_rust_bin" ] && [ -n "${HOME:-}" ] && \
        [ -x "$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo" ]; then
        jt_core_rust_bin=$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin
    fi

    if [ -z "$jt_core_rust_bin" ] && [ -n "${HOME:-}" ] && \
        [ -x "$HOME/.cargo/bin/cargo" ]; then
        jt_core_rust_bin=$HOME/.cargo/bin
    fi

    if [ -z "$jt_core_rust_bin" ]; then
        printf '%s' "$jt_core_original_path"
        exit 1
    fi

    jt_core_on_path=
    jt_core_original_ifs=$IFS
    IFS=:
    for jt_core_path_entry in $jt_core_original_path; do
        if [ "$jt_core_path_entry" = "$jt_core_rust_bin" ]; then
            jt_core_on_path=1
            break
        fi
    done
    IFS=$jt_core_original_ifs

    if [ -n "$jt_core_on_path" ]; then
        printf '%s' "$jt_core_original_path"
    else
        printf '%s%s%s' "$jt_core_rust_bin" \
            "${jt_core_original_path:+:}" "$jt_core_original_path"
    fi
); then
    export PATH
else
    printf '%s\n' 'jt-core: Rust toolchain not found; install rustup or provide cargo in the expected user toolchain directories.' >&2
    return 1 2>/dev/null || exit 1
fi
