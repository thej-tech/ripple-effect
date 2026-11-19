# Portable Local Ollama on Windows

This optional setup keeps the runtime and model under ignored workspace storage.
It does not add an application package, change PATH, install a Windows service,
or require administrator rights. The human authorized the runtime/model downloads
on 2026-11-19. Download permission is not evidence that inference has passed;
see the current Phase 4 integration report for observed verification.

## Sources and Licences

| Item | Official source | Licence/notes |
|---|---|---|
| Ollama v0.40.16 standalone AMD64 | <https://github.com/ollama/ollama/releases/tag/v0.40.16> | MIT for Ollama; retain the archive's bundled third-party notices |
| Windows instructions | <https://docs.ollama.com/windows> | Use the standalone CLI, not an installer or third-party service wrapper |
| Local-only settings | <https://docs.ollama.com/faq> | Loopback host, custom model directory, cloud features disabled |
| `qwen2.5:3b` | <https://ollama.com/library/qwen2.5:3b> | Qwen Research License, not Apache 2.0; research/evaluation non-commercial use; commercial use requires a separate licence |
| Model licence text | <https://ollama.com/library/qwen2.5:3b/blobs/b5c0e5cf74cf> | Review before use or redistribution; do not bundle the model in the repository |

The official release API reported a 1,618,244,995-byte portable archive and:

```text
SHA-256: 50fcf5ad54277f2fa5d173ebfc93bcb017adbc0c9ef2314daabc96ca9e6aa64e
```

The model registry advertises about 1.9 GB for the Q4_K_M model. Allow additional
space for extraction and runtime memory. Exact installed digests and observed
inference must be recorded after the pull; a tag's name alone is not proof.

## Download and Verify

Run from the repository root, after approval for downloads. Existing files should
not be overwritten without checking their provenance first. `backend/.venv/` is
ignored; never add runtime/model/private-key files to Git.

```powershell
$root = (Get-Location).Path
$archive = Join-Path $root 'backend\.venv\ollama-windows-amd64-v0.40.16.zip'
$runtime = Join-Path $root 'backend\.venv\ollama-v0.40.16'
curl.exe --fail --location --output $archive 'https://github.com/ollama/ollama/releases/download/v0.40.16/ollama-windows-amd64.zip'
if ($LASTEXITCODE -ne 0) { throw 'Official runtime download failed.' }
$expected = '50fcf5ad54277f2fa5d173ebfc93bcb017adbc0c9ef2314daabc96ca9e6aa64e'
if ((Get-FileHash $archive -Algorithm SHA256).Hash -ne $expected) {
    throw 'Runtime checksum mismatch. Do not execute or extract the archive.'
}
Expand-Archive -Path $archive -DestinationPath $runtime
```

## Start Local-Only Inference

Use a dedicated terminal. These assignments affect only that terminal/process
tree; do not persist them in Windows account settings. Home/temp overrides keep
runtime-created configuration inside the workspace. Do not inspect or share
private keys or wholesale server logs; runtime initialization may create keys.

```powershell
$root = (Get-Location).Path
$runtime = Join-Path $root 'backend\.venv\ollama-v0.40.16'
$runtimeHome = Join-Path $root 'backend\.venv\ollama-home'
$models = Join-Path $root 'backend\.venv\ollama-models'
$temporary = Join-Path $root 'backend\.venv\ollama-tmp'
New-Item -ItemType Directory -Force -Path $runtimeHome, $models, $temporary | Out-Null
$env:USERPROFILE = $runtimeHome
$env:HOME = $runtimeHome
$env:TEMP = $temporary
$env:TMP = $temporary
$env:OLLAMA_MODELS = $models
$env:OLLAMA_HOST = '127.0.0.1:11434'
$env:OLLAMA_NO_CLOUD = '1'
$env:OLLAMA_NUM_PARALLEL = '1'
$env:OLLAMA_MAX_LOADED_MODELS = '1'
$env:OLLAMA_CONTEXT_LENGTH = '4096'
& (Join-Path $runtime 'ollama.exe') serve *> (Join-Path $runtimeHome 'server.log')
```

In a second terminal at the repository root:

```powershell
$root = (Get-Location).Path
$env:OLLAMA_HOST = '127.0.0.1:11434'
$env:USERPROFILE = Join-Path $root 'backend\.venv\ollama-home'
$env:HOME = $env:USERPROFILE
& (Join-Path $root 'backend\.venv\ollama-v0.40.16\ollama.exe') pull qwen2.5:3b
curl.exe --fail --silent --show-error http://127.0.0.1:11434/api/tags
```

The backend uses `OLLAMA_BASE_URL=http://127.0.0.1:11434` and
`OLLAMA_MODEL=qwen2.5:3b`. The browser never calls Ollama directly.

## Acceptance and Resource Limits

After the model loads, run the fresh isolated genuine-AI workflow with
`RIPPLE_E2E_MANUAL=0`, then the saved-commentary restart check described in the
README. Never substitute manual weights or mocked responses for genuine evidence.

On a low-memory machine, close unneeded applications yourself. Do not stop
unrelated user processes, change paging/driver settings, silently use a different
model, or weaken timeouts/checks to manufacture a pass. If memory is insufficient,
record the actual error and keep the phase partial.

Stop the dedicated server with Ctrl+C when finished. Do not delete pre-existing
user models/databases. Recreating the Python virtual environment can remove this
ignored runtime storage, so keep the setup instructions rather than committing
the binaries.