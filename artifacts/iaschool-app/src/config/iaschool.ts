/**
 * Configuração pública da instalação IAschool.
 *
 * Esta é a única fonte de textos e identidade que pertencem ao produto.
 * Credenciais, URLs privadas, chaves e limites operacionais ficam somente no
 * ambiente do servidor.
 */
export const iaschool = {
  brand: {
    name: "IAschool",
    shortName: "IAS",
    description:
      "Organize as fotos dos alunos e entregue aos responsáveis em minutos.",
    colors: {
      primary: "#2563eb",
      accent: "#be123c",
      surface: "#f8fafc",
    },
  },
  modules: {
    schools: "Escolas",
    school: "Escola",
    classes: "Turmas",
    class: "Turma",
    students: "Alunos",
    student: "Aluno",
    teachers: "Professores",
  },
  roles: {
    dev: "Desenvolvedor",
    super_admin: "Administrador",
    user: "Escola",
  },
  memberRoles: {
    school_admin: "Administrador da escola",
    school_staff: "Equipe",
    teacher: "Professor(a)",
  },
  generation: {
    /**
     * Mensagem que acompanha a imagem no compartilhamento.
     * O aviso de caráter sintético é obrigatório e não deve ser removido
     * (Decreto nº 12.880/2026, art. 11, I).
     */
    shareMessage: (studentName: string) =>
      `Olá! Segue a arte de ${studentName} feita pela escola no IAschool. A imagem foi gerada por inteligência artificial a partir de uma foto real. Baixe a imagem e mande junto com esta mensagem.`,
  },
} as const;

export type IAschoolConfig = typeof iaschool;
