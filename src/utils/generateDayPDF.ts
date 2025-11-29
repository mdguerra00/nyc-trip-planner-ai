import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';

interface Program {
  id: string;
  title: string;
  description: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  address: string | null;
  notes: string | null;
  ai_suggestions: string | null;
  ai_faq: any;
}

interface ChatMessage {
  role: string;
  content: string;
  created_at: string;
  program_title?: string;
}

export async function generateDayPDF(date: string, userId: string) {
  try {
    // Buscar todos os programas do dia
    const { data: programs, error: programsError } = await supabase
      .from('programs')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .order('start_time', { ascending: true });

    if (programsError) throw programsError;

    if (!programs || programs.length === 0) {
      throw new Error('Nenhum programa encontrado para esta data');
    }

    // Buscar todas as mensagens de chat dos programas deste dia
    const programIds = programs.map(p => p.id);
    const { data: programChats, error: chatsError } = await supabase
      .from('program_chat_messages')
      .select(`
        role,
        content,
        created_at,
        program_id
      `)
      .eq('user_id', userId)
      .in('program_id', programIds)
      .order('created_at', { ascending: true });

    if (chatsError) throw chatsError;

    // Buscar mensagens do chat global que possam mencionar este dia ou programas
    const { data: globalChats, error: globalError } = await supabase
      .from('global_chat_messages')
      .select('role, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (globalError) throw globalError;

    // Criar o PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    let yPosition = 20;

    // Título principal
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
    doc.text(`Programação - ${formattedDate}`, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 15;

    // Linha separadora
    doc.setLineWidth(0.5);
    doc.line(20, yPosition, pageWidth - 20, yPosition);
    yPosition += 10;

    // Processar cada programa
    for (let i = 0; i < programs.length; i++) {
      const program = programs[i] as Program;
      
      // Verificar se precisa de nova página
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 20;
      }

      // Título do programa
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(41, 128, 185); // Azul
      const programNumber = `${i + 1}. `;
      doc.text(programNumber + program.title, 20, yPosition);
      yPosition += 8;

      // Horário
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      if (program.start_time || program.end_time) {
        const timeText = `⏰ ${program.start_time || '--:--'} - ${program.end_time || '--:--'}`;
        doc.text(timeText, 20, yPosition);
        yPosition += 6;
      }

      // Endereço
      if (program.address) {
        doc.setTextColor(100, 100, 100);
        const addressLines = doc.splitTextToSize(`📍 ${program.address}`, pageWidth - 40);
        doc.text(addressLines, 20, yPosition);
        yPosition += addressLines.length * 5 + 2;
      }

      yPosition += 3;

      // Descrição
      if (program.description) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        const descLines = doc.splitTextToSize(program.description, pageWidth - 40);
        doc.text(descLines, 20, yPosition);
        yPosition += descLines.length * 5 + 5;
      }

      // Notas
      if (program.notes) {
        if (yPosition > 240) {
          doc.addPage();
          yPosition = 20;
        }
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(150, 100, 50);
        doc.text('📝 Observações:', 20, yPosition);
        yPosition += 5;
        const notesLines = doc.splitTextToSize(program.notes, pageWidth - 40);
        doc.text(notesLines, 20, yPosition);
        yPosition += notesLines.length * 4 + 5;
      }

      // Sugestões da IA
      if (program.ai_suggestions) {
        if (yPosition > 230) {
          doc.addPage();
          yPosition = 20;
        }
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(138, 43, 226); // Roxo
        doc.text('🤖 Sugestões da IA:', 20, yPosition);
        yPosition += 5;
        doc.setTextColor(0, 0, 0);
        const aiLines = doc.splitTextToSize(program.ai_suggestions, pageWidth - 40);
        doc.text(aiLines, 20, yPosition);
        yPosition += aiLines.length * 4 + 5;
      }

      // FAQ da IA
      if (program.ai_faq && Array.isArray(program.ai_faq) && program.ai_faq.length > 0) {
        if (yPosition > 220) {
          doc.addPage();
          yPosition = 20;
        }
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(138, 43, 226);
        doc.text('❓ Perguntas & Respostas:', 20, yPosition);
        yPosition += 5;

        for (const faq of program.ai_faq) {
          if (yPosition > 250) {
            doc.addPage();
            yPosition = 20;
          }
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(0, 0, 0);
          const questionLines = doc.splitTextToSize(`P: ${faq.question}`, pageWidth - 45);
          doc.text(questionLines, 25, yPosition);
          yPosition += questionLines.length * 4 + 2;

          doc.setFont('helvetica', 'normal');
          doc.setTextColor(60, 60, 60);
          const answerLines = doc.splitTextToSize(`R: ${faq.answer}`, pageWidth - 45);
          doc.text(answerLines, 25, yPosition);
          yPosition += answerLines.length * 4 + 4;
        }
        yPosition += 3;
      }

      // Conversas do chat deste programa
      const programChatMessages = programChats?.filter(m => m.program_id === program.id) || [];
      
      if (programChatMessages.length > 0) {
        if (yPosition > 220) {
          doc.addPage();
          yPosition = 20;
        }
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(34, 139, 34); // Verde
        doc.text('💬 Conversas sobre este programa:', 20, yPosition);
        yPosition += 5;

        for (const msg of programChatMessages) {
          if (yPosition > 250) {
            doc.addPage();
            yPosition = 20;
          }

          doc.setFontSize(8);
          const isUser = msg.role === 'user';
          doc.setFont('helvetica', isUser ? 'bold' : 'normal');
          doc.setTextColor(isUser ? 0 : 80, isUser ? 0 : 80, isUser ? 0 : 80);
          
          const prefix = isUser ? '👤 Você: ' : '🤖 IA: ';
          const msgLines = doc.splitTextToSize(prefix + msg.content, pageWidth - 45);
          doc.text(msgLines, 25, yPosition);
          yPosition += msgLines.length * 4 + 3;
        }
        yPosition += 3;
      }

      // Linha separadora entre programas
      if (i < programs.length - 1) {
        if (yPosition > 260) {
          doc.addPage();
          yPosition = 20;
        }
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.line(20, yPosition, pageWidth - 20, yPosition);
        yPosition += 10;
      }
    }

    // Adicionar conversas globais relevantes
    const relevantGlobalChats = globalChats?.filter(msg => {
      const content = msg.content.toLowerCase();
      const dateStr = formattedDate.toLowerCase();
      // Verificar se menciona a data ou algum programa do dia
      return content.includes(dateStr) || 
             programs.some(p => content.includes(p.title.toLowerCase()));
    }) || [];

    if (relevantGlobalChats.length > 0) {
      if (yPosition > 220) {
        doc.addPage();
        yPosition = 20;
      } else {
        yPosition += 10;
      }

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(41, 128, 185);
      doc.text('💭 Conversas Gerais Relacionadas', 20, yPosition);
      yPosition += 8;

      for (const msg of relevantGlobalChats) {
        if (yPosition > 250) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFontSize(8);
        const isUser = msg.role === 'user';
        doc.setFont('helvetica', isUser ? 'bold' : 'normal');
        doc.setTextColor(isUser ? 0 : 80, isUser ? 0 : 80, isUser ? 0 : 80);
        
        const prefix = isUser ? '👤 Você: ' : '🤖 IA: ';
        const msgLines = doc.splitTextToSize(prefix + msg.content, pageWidth - 40);
        doc.text(msgLines, 20, yPosition);
        yPosition += msgLines.length * 4 + 3;
      }
    }

    // Rodapé em todas as páginas
    const totalPages = doc.internal.pages.length - 1;
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Página ${i} de ${totalPages} | Gerado em ${new Date().toLocaleDateString('pt-BR')}`,
        pageWidth / 2,
        doc.internal.pageSize.height - 10,
        { align: 'center' }
      );
    }

    // Salvar o PDF
    const fileName = `programacao-${date}.pdf`;
    doc.save(fileName);

    return { success: true, fileName };
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    throw error;
  }
}
