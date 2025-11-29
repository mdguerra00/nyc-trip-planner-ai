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


// Função para remover emojis e caracteres especiais não-ASCII
function removeEmojis(text: string): string {
  if (!text) return '';
  
  return text
    // Remove emojis Unicode (ranges completos)
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Símbolos & Pictogramas
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transporte & Mapas
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '') // Bandeiras
    .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Símbolos diversos
    .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')   // Variation Selectors
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Supplemental Symbols
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '') // Chess Symbols
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '') // Symbols Extended-A
    .replace(/[\u{231A}-\u{231B}]/gu, '')   // Watch, Hourglass
    .replace(/[\u{23E9}-\u{23F3}]/gu, '')   // Botões de mídia
    .replace(/[\u{23F8}-\u{23FA}]/gu, '')   // Mais botões
    .replace(/[\u{25AA}-\u{25AB}]/gu, '')   // Quadrados
    .replace(/[\u{25B6}]/gu, '')            // Play
    .replace(/[\u{25C0}]/gu, '')            // Reverse
    .replace(/[\u{25FB}-\u{25FE}]/gu, '')   // Mais quadrados
    .replace(/[\u{2614}-\u{2615}]/gu, '')   // Guarda-chuva, café
    .replace(/[\u{2648}-\u{2653}]/gu, '')   // Signos
    .replace(/[\u{267F}]/gu, '')            // Acessibilidade
    .replace(/[\u{2693}]/gu, '')            // Âncora
    .replace(/[\u{26A1}]/gu, '')            // Raio
    .replace(/[\u{26AA}-\u{26AB}]/gu, '')   // Círculos
    .replace(/[\u{26BD}-\u{26BE}]/gu, '')   // Bolas esportivas
    .replace(/[\u{26C4}-\u{26C5}]/gu, '')   // Boneco de neve, sol
    .replace(/[\u{26CE}]/gu, '')            // Ophiuchus
    .replace(/[\u{26D4}]/gu, '')            // Proibido
    .replace(/[\u{26EA}]/gu, '')            // Igreja
    .replace(/[\u{26F2}-\u{26F3}]/gu, '')   // Fonte, golfe
    .replace(/[\u{26F5}]/gu, '')            // Barco
    .replace(/[\u{26FA}]/gu, '')            // Tenda
    .replace(/[\u{26FD}]/gu, '')            // Posto
    .replace(/[\u{2702}]/gu, '')            // Tesoura
    .replace(/[\u{2705}]/gu, '')            // Check verde
    .replace(/[\u{2708}-\u{270D}]/gu, '')   // Avião, etc
    .replace(/[\u{270F}]/gu, '')            // Lápis
    .replace(/[\u{2712}]/gu, '')            // Caneta
    .replace(/[\u{2714}]/gu, '')            // Check
    .replace(/[\u{2716}]/gu, '')            // X
    .replace(/[\u{271D}]/gu, '')            // Cruz
    .replace(/[\u{2721}]/gu, '')            // Estrela de Davi
    .replace(/[\u{2728}]/gu, '')            // Sparkles
    .replace(/[\u{2733}-\u{2734}]/gu, '')   // Asteriscos
    .replace(/[\u{2744}]/gu, '')            // Floco de neve
    .replace(/[\u{2747}]/gu, '')            // Sparkle
    .replace(/[\u{274C}]/gu, '')            // X vermelho
    .replace(/[\u{274E}]/gu, '')            // X verde
    .replace(/[\u{2753}-\u{2755}]/gu, '')   // Interrogações
    .replace(/[\u{2757}]/gu, '')            // Exclamação
    .replace(/[\u{2763}-\u{2764}]/gu, '')   // Coração
    .replace(/[\u{2795}-\u{2797}]/gu, '')   // Operações matemáticas
    .replace(/[\u{27A1}]/gu, '')            // Seta direita
    .replace(/[\u{27B0}]/gu, '')            // Loop
    .replace(/[\u{27BF}]/gu, '')            // Loop duplo
    .replace(/[\u{2934}-\u{2935}]/gu, '')   // Setas
    .replace(/[\u{2B05}-\u{2B07}]/gu, '')   // Setas
    .replace(/[\u{2B1B}-\u{2B1C}]/gu, '')   // Quadrados
    .replace(/[\u{2B50}]/gu, '*')           // Estrela -> asterisco
    .replace(/[\u{2B55}]/gu, 'o')           // Círculo -> o
    .replace(/[\u{3030}]/gu, '~')           // Wavy dash
    .replace(/[\u{303D}]/gu, '')            // Part alternation mark
    .replace(/[\u{3297}]/gu, '')            // Circled Ideograph
    .replace(/[\u{3299}]/gu, '')            // Circled Ideograph Secret
    // Substituições úteis
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/★/g, '*')
    .replace(/•/g, '-')
    .replace(/·/g, '-')
    .replace(/…/g, '...')
    // Limpar espaços duplos que podem sobrar
    .replace(/\s+/g, ' ')
    .trim();
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
      const programTitle = `${i + 1}. ${removeEmojis(program.title)}`;
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
        const addressLines = doc.splitTextToSize(`Local: ${removeEmojis(program.address)}`, contentWidth);
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
        const descLines = doc.splitTextToSize(removeEmojis(program.description), contentWidth);
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
        const notesLines = doc.splitTextToSize(removeEmojis(program.notes), contentWidth - 6);
        doc.text(notesLines, margin + 3, yPosition);
        yPosition += notesLines.length * 4 + 5;
      }


      // FAQ da IA (completas, sem truncamento)
      if (program.ai_faq && Array.isArray(program.ai_faq) && program.ai_faq.length > 0) {
        if (yPosition > pageHeight - 60) {
          doc.addPage();
          yPosition = margin + 5;
        }
        yPosition = addStyledHeader(doc, '> PERGUNTAS FREQUENTES (FAQ)', yPosition, pageWidth);
        
        for (const faq of program.ai_faq) {
          if (yPosition > pageHeight - 35) {
            doc.addPage();
            yPosition = margin + 5;
          }
          
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(0, 0, 0);
          const question = removeEmojis(faq.question);
          const questionLines = doc.splitTextToSize(`P: ${question}`, contentWidth - 9);
          doc.text(questionLines, margin + 6, yPosition);
          yPosition += questionLines.length * 3.5 + 1;

          doc.setFont('helvetica', 'normal');
          doc.setTextColor(60, 60, 60);
          const answer = removeEmojis(faq.answer);
          const answerLines = doc.splitTextToSize(`R: ${answer}`, contentWidth - 9);
          doc.text(answerLines, margin + 6, yPosition);
          yPosition += answerLines.length * 3.5 + 3;
        }
        yPosition += 2;
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

    // Remover seção de conversas globais (não é mais necessário)

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
