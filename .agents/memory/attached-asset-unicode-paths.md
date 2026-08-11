---
name: Attached-asset unicode paths
description: Workaround for ReadFile failures on accented attachment filenames
---
- Attachment filenames containing accented characters (e.g. "Captura de Tela às ...") can fail ReadFile because of NFC/NFD unicode normalization mismatches.
- **How to apply:** copy the file with a shell glob (`cp *Captura* /tmp/ref.png`) to an ASCII path, then read that.
