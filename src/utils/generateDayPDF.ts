import jsPDF from 'jspdf';
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

interface PdfContent {
  region_intro: {
    region_name: string;
    intro_text: string;
  };
  locations: Array<{
    program_index: number;
    guide_text: string;
  }>;
}

// Função para remover emojis e caracteres especiais não-ASCII
function removeEmojis(text: string): string {
  if (!text) return '';
  
  return text
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')
    .replace(/[\u{231A}-\u{231B}]/gu, '')
    .replace(/[\u{23E9}-\u{23F3}]/gu, '')
    .replace(/[\u{23F8}-\u{23FA}]/gu, '')
    .replace(/[\u{25AA}-\u{25AB}]/gu, '')
    .replace(/[\u{25B6}]/gu, '')
    .replace(/[\u{25C0}]/gu, '')
    .replace(/[\u{25FB}-\u{25FE}]/gu, '')
    .replace(/[\u{2614}-\u{2615}]/gu, '')
    .replace(/[\u{2648}-\u{2653}]/gu, '')
    .replace(/[\u{267F}]/gu, '')
    .replace(/[\u{2693}]/gu, '')
    .replace(/[\u{26A1}]/gu, '')
    .replace(/[\u{26AA}-\u{26AB}]/gu, '')
    .replace(/[\u{26BD}-\u{26BE}]/gu, '')
    .replace(/[\u{26C4}-\u{26C5}]/gu, '')
    .replace(/[\u{26CE}]/gu, '')
    .replace(/[\u{26D4}]/gu, '')
    .replace(/[\u{26EA}]/gu, '')
    .replace(/[\u{26F2}-\u{26F3}]/gu, '')
    .replace(/[\u{26F5}]/gu, '')
    .replace(/[\u{26FA}]/gu, '')
    .replace(/[\u{26FD}]/gu, '')
    .replace(/[\u{2702}]/gu, '')
    .replace(/[\u{2705}]/gu, '')
    .replace(/[\u{2708}-\u{270D}]/gu, '')
    .replace(/[\u{270F}]/gu, '')
    .replace(/[\u{2712}]/gu, '')
    .replace(/[\u{2714}]/gu, '')
    .replace(/[\u{2716}]/gu, '')
    .replace(/[\u{271D}]/gu, '')
    .replace(/[\u{2721}]/gu, '')
    .replace(/[\u{2728}]/gu, '')
    .replace(/[\u{2733}-\u{2734}]/gu, '')
    .replace(/[\u{2744}]/gu, '')
    .replace(/[\u{2747}]/gu, '')
    .replace(/[\u{274C}]/gu, '')
    .replace(/[\u{274E}]/gu, '')
    .replace(/[\u{2753}-\u{2755}]/gu, '')
    .replace(/[\u{2757}]/gu, '')
    .replace(/[\u{2763}-\u{2764}]/gu, '')
    .replace(/[\u{2795}-\u{2797}]/gu, '')
    .replace(/[\u{27A1}]/gu, '')
    .replace(/[\u{27B0}]/gu, '')
    .replace(/[\u{27BF}]/gu, '')
    .replace(/[\u{2934}-\u{2935}]/gu, '')
    .replace(/[\u{2B05}-\u{2B07}]/gu, '')
    .replace(/[\u{2B1B}-\u{2B1C}]/gu, '')
    .replace(/[\u{2B50}]/gu, '*')
    .replace(/[\u{2B55}]/gu, 'o')
    .replace(/[\u{3030}]/gu, '~')
    .replace(/[\u{303D}]/gu, '')
    .replace(/[\u{3297}]/gu, '')
    .replace(/[\u{3299}]/gu, '')
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/★/g, '*')
    .replace(/•/g, '-')
    .replace(/·/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

// Função para adicionar cabeçalho estilizado
function addStyledHeader(doc: jsPDF, text: string, yPos: number, pageWidth: number): number {
  doc.setFillColor(240, 248, 255);
  doc.rect(15, yPos - 5, pageWidth - 30, 8, 'F');
  
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

// Buscar conteúdo de guia turístico via IA
async function fetchGuideContent(programs: Program[], date: string): Promise<PdfContent | null> {
  try {
    // Buscar destino do perfil de viagem
    const { data: profile } = await supabase
      .from('travel_profile')
      .select('destination')
      .single();
    
    const destination = profile?.destination || 'New York City';
    
    const { data, error } = await supabase.functions.invoke('generate-pdf-content', {
      body: {
        programs: programs.map(p => ({
          title: p.title,
          address: p.address,
          description: p.description,
        })),
        date,
        destination,
      },
    });

    if (error) {
      console.error('Error fetching guide content:', error);
      return null;
    }

    return data as PdfContent;
  } catch (err) {
    console.error('Failed to fetch guide content:', err);
    return null;
  }
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

    // Buscar conteúdo de guia turístico via IA
    const guideContent = await fetchGuideContent(programs as Program[], date);

    // Criar o PDF
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
    doc.text(`ROTEIRO - ${formattedDate.toUpperCase()}`, pageWidth / 2, yPosition + 3, { align: 'center' });
    yPosition += 20;

    // INTRODUÇÃO DA REGIÃO
    if (guideContent?.region_intro) {
      // Nome da região como subtítulo
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(41, 98, 155);
      doc.text(removeEmojis(guideContent.region_intro.region_name), pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 8;

      // Linha decorativa
      doc.setDrawColor(41, 98, 155);
      doc.setLineWidth(0.5);
      const lineWidth = 60;
      doc.line((pageWidth - lineWidth) / 2, yPosition, (pageWidth + lineWidth) / 2, yPosition);
      yPosition += 8;

      // Texto de introdução
      doc.setFontSize(10);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(60, 60, 60);
      const introLines = doc.splitTextToSize(removeEmojis(guideContent.region_intro.intro_text), contentWidth);
      doc.text(introLines, margin, yPosition);
      yPosition += introLines.length * 5 + 10;

      // Separador após introdução
      yPosition = addSeparatorLine(doc, yPosition, pageWidth);
      yPosition += 5;
    }

    // Processar cada programa
    for (let i = 0; i < programs.length; i++) {
      const program = programs[i] as Program;
      
      // Verificar se precisa de nova página
      if (yPosition > pageHeight - 50) {
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

      // TEXTO DE GUIA TURÍSTICO (substitui o FAQ)
      // Busca por índice exato, ou fallback por posição no array
      const locationGuide = guideContent?.locations?.find(l => l.program_index === i) 
        || guideContent?.locations?.[i];
      if (locationGuide?.guide_text) {
        if (yPosition > pageHeight - 50) {
          doc.addPage();
          yPosition = margin + 5;
        }
        
        yPosition = addStyledHeader(doc, '> SOBRE ESTE LOCAL', yPosition, pageWidth);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(40, 40, 40);
        const guideLines = doc.splitTextToSize(removeEmojis(locationGuide.guide_text), contentWidth - 6);
        doc.text(guideLines, margin + 3, yPosition);
        yPosition += guideLines.length * 4 + 5;
      } else if (program.description) {
        // Fallback: usar descrição se não tiver guia
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(40, 40, 40);
        const descLines = doc.splitTextToSize(removeEmojis(program.description), contentWidth);
        doc.text(descLines, margin, yPosition);
        yPosition += descLines.length * 4.5 + 5;
      }

      // Notas/Observações (mantém)
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
    const fileName = `roteiro-${date}.pdf`;
    doc.save(fileName);

    return { success: true, fileName };
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    throw error;
  }
}
