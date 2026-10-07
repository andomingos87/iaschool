import { useState } from 'react';
import { Combobox } from '../../components/ui/combobox';
import { Stack } from '../parts';

const SERIES = [
  'Educação infantil',
  '1º ano',
  '2º ano',
  '3º ano',
  '4º ano',
  '5º ano',
  '6º ano',
].map((label) => ({ value: label, label }));

const STUDENTS = [
  'Ana',
  'Bruno',
  'Cecília',
  'Diego',
  'Elisa',
  'Fábio',
  'João',
  '3º ano — Maria',
].map((label) => ({ value: label, label }));

export function ComboboxDemo() {
  const [serie, setSerie] = useState('3º ano');
  const [aluno, setAluno] = useState('');

  return (
    <div className="max-w-sm space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="Até 7 itens, sem busca">
        <Combobox
          value={serie}
          onValueChange={setSerie}
          options={SERIES}
          placeholder="Série"
        />
      </Stack>
      <Stack label="Mais de 7, com busca">
        <Combobox
          value={aluno}
          onValueChange={setAluno}
          options={[
            { value: '', label: 'Sem aluno', pinned: true },
            ...STUDENTS,
          ]}
          placeholder="Aluno"
        />
      </Stack>
    </div>
  );
}
