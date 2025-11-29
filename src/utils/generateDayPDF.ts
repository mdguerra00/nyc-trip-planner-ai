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
  program_id?: string;
}

// Função para truncar texto
function truncateText(text: string, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// Função para resumir mensagens de chat
function summarizeMessages(messages: ChatMessage[], maxCount: number): ChatMessage[] {
  if (messages.length <= maxCount) return messages;
  // Pegar as últimas N mensagens (mais recentes são mais relevantes)
  return messages.slice(-maxCount);
}

// Função para adicionar cabeçalho estilizado
function addStyledHeader(doc: jsPDF, text: string, yPos: number, pageWidth: number): number {
  // Fundo colorido para o cabeçalho
  doc.setFillColor(240, 248, 255); // Azul claro suave
  doc.rect(15, yPos - 5, pageWidth - 30, 8, 'F');
  
  // Texto do cabeçalho
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(41, 98, 155);
  doc.text(text, 18, yPos);
  
  return yPos + 6;
}

// Função para adicionar linha separadora
function addSeparatorLine(doc: jsPDF, yPos: number, pageWidth: number): number {
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(15, yPos, pageWidth - 15, yPos);
  return yPos + 5;
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

    // Buscar mensagens de chat dos programas
    const programIds = programs.map(p => p.id);
    const { data: programChats, error: chatsError } = await supabase
      .from('program_chat_messages')
      .select('role, content, created_at, program_id')
      .eq('user_id', userId)
      .in('program_id', programIds)
      .order('created_at', { ascending: true });

    if (chatsError) throw chatsError;

    // Buscar mensagens do chat global relevantes
    const { data: globalChats, error: globalError } = await supabase
      .from('global_chat_messages')
      .select('role, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (globalError) throw globalError;

    // Criar o PDF com margens consistentes
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);
    let yPosition = margin + 5;

    // Título principal estilizado
    doc.setFillColor(41, 98, 155);
    doc.rect(0, yPosition - 5, pageWidth, 15, 'F');
    
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
    doc.text(`PROGRAMACAO - ${formattedDate.toUpperCase()}`, pageWidth / 2, yPosition + 3, { align: 'center' });
    yPosition += 20;

    // Processar cada programa
    for (let i = 0; i < programs.length; i++) {
      const program = programs[i] as Program;
      
      // Verificar se precisa de nova página
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = margin + 5;
      }

      // Número e título do programa
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(41, 98, 155);
      const programTitle = `${i + 1}. ${program.title}`;
      const titleLines = doc.splitTextToSize(programTitle, contentWidth);
      doc.text(titleLines, margin, yPosition);
      yPosition += titleLines.length * 6 + 2;

      // Linha sob o título
      doc.setDrawColor(41, 98, 155);
      doc.setLineWidth(0.5);
      doc.line(margin, yPosition, margin + 50, yPosition);
      yPosition += 5;

      // Horário
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      if (program.start_time || program.end_time) {
        const timeText = `Horario: ${program.start_time || '--:--'} - ${program.end_time || '--:--'}`;
        doc.text(timeText, margin, yPosition);
        yPosition += 5;
      }

      // Endereço
      if (program.address) {
        const addressLines = doc.splitTextToSize(`Local: ${program.address}`, contentWidth);
        doc.text(addressLines, margin, yPosition);
        yPosition += addressLines.length * 4.5 + 3;
      } else {
        yPosition += 2;
      }

      // Descrição
      if (program.description) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        const descLines = doc.splitTextToSize(program.description, contentWidth);
        doc.text(descLines, margin, yPosition);
        yPosition += descLines.length * 4.5 + 5;
      }

      // Notas/Observações
      if (program.notes) {
        if (yPosition > pageHeight - 50) {
          doc.addPage();
          yPosition = margin + 5;
        }
        yPosition = addStyledHeader(doc, '> OBSERVACOES', yPosition, pageWidth);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(100, 80, 60);
        const notesLines = doc.splitTextToSize(program.notes, contentWidth - 6);
        doc.text(notesLines, margin + 3, yPosition);
        yPosition += notesLines.length * 4 + 5;
      }

      // Sugestões da IA (condensadas)
      if (program.ai_suggestions) {
        if (yPosition > pageHeight - 50) {
          doc.addPage();
          yPosition = margin + 5;
        }
        yPosition = addStyledHeader(doc, '> DICAS DA IA', yPosition, pageWidth);
        
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        
        // Condensar sugestões para 70% do tamanho original
        const condensedSuggestions = truncateText(program.ai_suggestions, Math.floor(program.ai_suggestions.length * 0.7));
        const aiLines = doc.splitTextToSize(condensedSuggestions, contentWidth - 6);
        doc.text(aiLines, margin + 3, yPosition);
        yPosition += aiLines.length * 4 + 5;
      }

      // FAQ da IA (primeiras 3 perguntas apenas)
      if (program.ai_faq && Array.isArray(program.ai_faq) && program.ai_faq.length > 0) {
        if (yPosition > pageHeight - 60) {
          doc.addPage();
          yPosition = margin + 5;
        }
        yPosition = addStyledHeader(doc, '> FAQ', yPosition, pageWidth);

        // Limitar a 3 FAQs mais relevantes
        const limitedFaqs = program.ai_faq.slice(0, 3);
        
        for (const faq of limitedFaqs) {
          if (yPosition > pageHeight - 35) {
            doc.addPage();
            yPosition = margin + 5;
          }
          
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(0, 0, 0);
          const question = truncateText(faq.question, 120);
          const questionLines = doc.splitTextToSize(`P: ${question}`, contentWidth - 9);
          doc.text(questionLines, margin + 6, yPosition);
          yPosition += questionLines.length * 3.5 + 1;

          doc.setFont('helvetica', 'normal');
          doc.setTextColor(60, 60, 60);
          const answer = truncateText(faq.answer, 200);
          const answerLines = doc.splitTextToSize(`R: ${answer}`, contentWidth - 9);
          doc.text(answerLines, margin + 6, yPosition);
          yPosition += answerLines.length * 3.5 + 3;
        }
        yPosition += 2;
      }

      // Conversas do chat deste programa (últimas 5 mensagens, condensadas)
      const programChatMessages = programChats?.filter(m => m.program_id === program.id) || [];
      const summarizedProgramChats = summarizeMessages(programChatMessages, 5);
      
      if (summarizedProgramChats.length > 0) {
        if (yPosition > pageHeight - 50) {
          doc.addPage();
          yPosition = margin + 5;
        }
        yPosition = addStyledHeader(doc, '> CONVERSAS', yPosition, pageWidth);

        for (const msg of summarizedProgramChats) {
          if (yPosition > pageHeight - 30) {
            doc.addPage();
            yPosition = margin + 5;
          }

          doc.setFontSize(8);
          const isUser = msg.role === 'user';
          doc.setFont('helvetica', isUser ? 'bold' : 'normal');
          doc.setTextColor(isUser ? 0 : 80, isUser ? 0 : 80, isUser ? 0 : 80);
          
          const prefix = isUser ? '[Voce] ' : '[IA] ';
          const maxLength = isUser ? 100 : 200;
          const condensedContent = truncateText(msg.content, maxLength);
          const msgLines = doc.splitTextToSize(prefix + condensedContent, contentWidth - 9);
          doc.text(msgLines, margin + 6, yPosition);
          yPosition += msgLines.length * 3.5 + 2;
        }
        yPosition += 3;
      }

      // Linha separadora entre programas
      if (i < programs.length - 1) {
        if (yPosition > pageHeight - 25) {
          doc.addPage();
          yPosition = margin + 5;
        }
        yPosition = addSeparatorLine(doc, yPosition, pageWidth);
        yPosition += 5;
      }
    }

    // Conversas globais relevantes (máximo 3 mensagens)
    const relevantGlobalChats = globalChats?.filter(msg => {
      const content = msg.content.toLowerCase();
      const dateStr = formattedDate.toLowerCase();
      return content.includes(dateStr) || 
             programs.some(p => content.includes(p.title.toLowerCase()));
    }) || [];

    const summarizedGlobalChats = summarizeMessages(relevantGlobalChats, 3);

    if (summarizedGlobalChats.length > 0) {
      if (yPosition > pageHeight - 50) {
        doc.addPage();
        yPosition = margin + 5;
      } else {
        yPosition += 8;
      }

      yPosition = addStyledHeader(doc, '> CONVERSAS GERAIS RELACIONADAS', yPosition, pageWidth);

      for (const msg of summarizedGlobalChats) {
        if (yPosition > pageHeight - 30) {
          doc.addPage();
          yPosition = margin + 5;
        }

        doc.setFontSize(8);
        const isUser = msg.role === 'user';
        doc.setFont('helvetica', isUser ? 'bold' : 'normal');
        doc.setTextColor(isUser ? 0 : 80, isUser ? 0 : 80, isUser ? 0 : 80);
        
        const prefix = isUser ? '[Voce] ' : '[IA] ';
        const maxLength = isUser ? 100 : 200;
        const condensedContent = truncateText(msg.content, maxLength);
        const msgLines = doc.splitTextToSize(prefix + condensedContent, contentWidth - 6);
        doc.text(msgLines, margin + 3, yPosition);
        yPosition += msgLines.length * 3.5 + 2;
      }
    }

    // Rodapé em todas as páginas
    const totalPages = doc.internal.pages.length - 1;
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Pagina ${i} de ${totalPages} | Gerado em ${new Date().toLocaleDateString('pt-BR')}`,
        pageWidth / 2,
        pageHeight - 8,
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
