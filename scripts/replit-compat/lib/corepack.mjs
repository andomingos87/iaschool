// Invocação do Corepack que funciona nas três plataformas do CI.
//
// No Windows o `corepack` é um `corepack.cmd`, e desde a correção do
// CVE-2024-27980 (Node 18.20.2 / 20.12.2 / 21.7.3) o `child_process.spawn`
// recusa `.cmd` e `.bat` sem `shell: true` — daí o `spawn corepack ENOENT` que
// derrubava o job do Windows.
//
// O `shell: true` é aplicado só ao próprio Corepack, e só no Windows: os
// argumentos daqui são literais do repositório, nunca entrada de usuário.
// Comandos injetados em teste (como `process.execPath`) seguem sem shell, para
// que o argumento continue chegando intacto.

export const COREPACK = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

export function spawnOptionsFor(command) {
  const isCorepack = /(^|[\\/])corepack(\.cmd)?$/i.test(command);
  return process.platform === 'win32' && isCorepack ? { shell: true } : {};
}
