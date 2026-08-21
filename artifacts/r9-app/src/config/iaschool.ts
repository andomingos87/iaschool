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
    description: "Crie imagens de desempenho para alunos e turmas em segundos.",
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
    super_admin: "Administrador",
    school_user: "Professor",
    student: "Aluno",
  },
  generation: {
    platformLogoLabel: "Logo IAschool",
    shareMessage: (studentName: string) =>
      `Olá! Confira o card de desempenho de ${studentName} no IAschool. Baixe a imagem gerada e mande junto com esta mensagem. Vamos juntos!`,
  },
} as const;

export type IAschoolConfig = typeof iaschool;
