#!/usr/bin/env python3
"""Install the Atlas event hooks without replacing hooks owned by other tools."""
import argparse
from pathlib import Path
import shlex
import sys

from update import Git, HERE

HOOKS = ('post-commit', 'post-merge', 'post-rewrite')


def hook_path(repo, event='post-commit'):
    git = Git(repo)
    configured = git('config', '--get', 'core.hooksPath', optional=True).strip()
    if configured:
        raise RuntimeError('core.hooksPath está configurado; integre o Atlas ao gerenciador existente.')
    common = Path(git('rev-parse', '--path-format=absolute', '--git-common-dir').strip())
    return common / 'hooks' / event


def marker(event):
    # Keep the original post-commit marker so existing installations upgrade.
    return '# git-atlas-managed-' + event + '-v1'


def hook_text(repo, event):
    command = ' '.join(shlex.quote(str(s)) for s in (
        Path(sys.executable).absolute(), HERE / 'update.py', '--repo', Path(repo).resolve(),
        '--output', HERE / 'git-state.json', '--trigger', event,
    ))
    guard = ''
    if event == 'post-rewrite':
        # Drain Git's old/new commit pairs. Amend already runs post-commit.
        guard = 'cat >/dev/null\n[ "$1" = "rebase" ] || exit 0\n'
    elif event == 'post-commit':
        # A rebase can replay many commits. Collect once at post-rewrite instead.
        guard = ('if [ -d "$(git rev-parse --git-path rebase-merge)" ] || '
                 '[ -d "$(git rev-parse --git-path rebase-apply)" ]; then\n  exit 0\nfi\n')
    return '#!/bin/sh\n' + marker(event) + '\n' + guard + command + ' >/dev/null || {\n  printf "%s\\n" "Git Atlas: não foi possível atualizar o JSON; a operação Git foi preservada." >&2\n}\nexit 0\n'


def install(repo, remove=False):
    directory = hook_path(repo).parent
    targets = [directory / event for event in HOOKS]
    # Validate every destination before changing any hook.
    for target in targets:
        if target.is_symlink():
            raise RuntimeError(target.name + ' é um link simbólico; nenhum hook foi alterado.')
        if target.exists() and marker(target.name) not in target.read_text().splitlines():
            raise RuntimeError(target.name + ' pertence a outra ferramenta; nenhum hook foi alterado.')
    for target in targets:
        if remove:
            if target.exists():
                target.unlink()
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation avoids overwriting a new hook installed concurrently.
        with target.open('w' if target.exists() else 'x') as handle:
            handle.write(hook_text(repo, target.name))
        target.chmod(0o755)
    return targets


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=HERE.parent.parent)
    parser.add_argument('--remove', action='store_true')
    args = parser.parse_args()
    try:
        targets = install(args.repo, args.remove)
    except (OSError, RuntimeError) as error:
        parser.exit(1, str(error) + '\n')
    for target in targets:
        print(('Hook removido: ' if args.remove else 'Hook instalado: ') + str(target))


if __name__ == '__main__':
    main()
