import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

// Interfaces
interface TravelProfile {
  travelers: Array<{ name: string; age: number; interests: string[] }>;
  interests: string[];
  dietary_restrictions: string[];
  mobility_notes?: string;
  pace: 'relaxed' | 'moderate' | 'active';
  budget_level: 'budget' | 'moderate' | 'luxury';
  avoid_topics: string[];
  preferred_categories: string[];
  notes?: string;
}

interface TripConfig {
  start_date: string;
  end_date: string;
  hotel_address?: string;
}

interface Program {
  id: string;
  title: string;
  date: string;
  start_time?: string;
  end_time?: string;
  address?: string;
  description?: string;
}

interface TravelContext {
  profile: TravelProfile | null;
  tripConfig: TripConfig | null;
  programs: Program[];
  currentDate: string;
  region: string;
}

// Helper: Get season based on date
function getSeason(date: Date): {
  name: string;
  temp: string;
  clothing: string;
  tips: string;
  avoid: string;
} {
  const month = date.getMonth();
  
  // Winter: Dec, Jan, Feb
  if (month === 11 || month === 0 || month === 1) {
    return {
      name: "Inverno",
      temp: "Muito frio (0-8°C), com possibilidade de neve e ventos gelados",
      clothing: "Casaco pesado de inverno, luvas, gorro, cachecol, botas impermeáveis, várias camadas de roupa",
      tips: "Época perfeita para patinação no gelo, mercados de Natal, shows da Broadway, museus. Central Park nevado é mágico.",
      avoid: "Atividades ao ar livre prolongadas sem aquecimento. Evite subestimar o frio - o vento pode ser cortante."
    };
  }
  
  // Spring: Mar, Apr, May
  if (month >= 2 && month <= 4) {
    return {
      name: "Primavera",
      temp: "Agradável (10-20°C), mas variável - pode ter dias frios ou chuva",
      clothing: "Casaco leve, jaqueta corta-vento, camadas removíveis, guarda-chuva sempre à mão",
      tips: "Flores de cerejeira no Brooklyn Botanic Garden (final março/abril), clima ideal para caminhar, parques ficam lindos.",
      avoid: "Não confie totalmente na previsão - primavera em NY é imprevisível. Tenha sempre um plano B indoor."
    };
  }
  
  // Summer: Jun, Jul, Aug
  if (month >= 5 && month <= 7) {
    return {
      name: "Verão",
      temp: "Quente e úmido (25-35°C), pode ser abafado",
      clothing: "Roupas leves e respiráveis, chapéu, óculos de sol, protetor solar, garrafa de água",
      tips: "Praias de Coney Island, eventos ao ar livre, rooftop bars, Shakespeare in the Park, shows de rua.",
      avoid: "Metrô pode ser muito quente. Evite atividades ao ar livre nas horas mais quentes (12-15h). Mantenha-se hidratado."
    };
  }
  
  // Fall: Sep, Oct, Nov
  return {
    name: "Outono",
    temp: "Agradável a fresco (10-20°C)",
    clothing: "Casaco médio, suéter, camadas - manhãs/noites frias, dias agradáveis",
    tips: "Melhor época! Folhas coloridas no Central Park, Halloween, Thanksgiving, clima perfeito para caminhar.",
    avoid: "Final de novembro pode ficar muito frio. Não subestime as temperaturas noturnas."
  };
}

// Helper: Check if date is a holiday or special event
function checkIfHoliday(date: Date): string | null {
  const month = date.getMonth();
  const day = date.getDate();
  
  // Major holidays and events
  if (month === 0 && day === 1) return "Ano Novo - muitos lugares fechados, Times Square lotada";
  if (month === 1 && day === 14) return "Dia dos Namorados - restaurantes lotados, reserve com antecedência";
  if (month === 2 && day === 17) return "St. Patrick's Day - grande parada na 5th Avenue, pubs cheios";
  if (month === 6 && day === 4) return "Independence Day - fogos de artifório, eventos especiais, muito movimentado";
  if (month === 9 && day === 31) return "Halloween - Village Halloween Parade, decorações por toda parte";
  if (month === 10 && day >= 22 && day <= 28) return "Thanksgiving - Macy's Parade, Black Friday, muitas lojas com ofertas";
  if (month === 11 && day === 25) return "Natal - decorações magníficas, Rockefeller Center, shows temáticos";
  if (month === 11 && day === 31) return "Reveillon - Times Square lotada, precisa chegar cedo";
  
  // Check for typical NYC events by month
  if (month === 0) return "NYC Restaurant Week (geralmente), Winter Jazzfest";
  if (month === 1) return "Fashion Week, Westminster Dog Show";
  if (month === 2) return "Armory Show (arte)";
  if (month === 3) return "Tribeca Film Festival, Easter Parade na 5th Avenue";
  if (month === 4) return "Fleet Week (navios militares), Frieze Art Fair";
  if (month === 5) return "Pride Month - parada no final do mês, eventos LGBT+";
  if (month === 6) return "Macy's Fireworks (4th), summerstage concerts";
  if (month === 7) return "US Open (tênis) começa, Restaurant Week";
  if (month === 8) return "Fashion Week, NY Film Festival começa";
  if (month === 10) return "NYC Marathon, Macy's Parade";
  
  return null;
}

// Helper: Get local context based on region
function getLocalContext(region: string): string {
  const contexts: { [key: string]: string } = {
    "Manhattan": "Centro de NYC, inclui Midtown, Upper East/West Side, Lower Manhattan, Greenwich Village, SoHo, Tribeca, Harlem. Metrô muito acessível. Tudo fica relativamente perto.",
    "Brooklyn": "Do outro lado do East River. Inclui Williamsburg (hipster), DUMBO (vista para Manhattan), Park Slope (família), Coney Island (praia). Metrô conecta bem, mas distâncias maiores.",
    "Queens": "Borough mais diverso. Flushing (comida asiática incrível), Astoria (grega), Long Island City (arte). Mais afastado, considere tempo extra no metrô.",
    "Bronx": "Yankee Stadium, Bronx Zoo, New York Botanical Garden, Arthur Avenue (Little Italy autêntica). Geralmente requer mais tempo de deslocamento.",
    "Staten Island": "Mais residencial, menos turístico. Staten Island Ferry é grátis e oferece ótima vista da Estátua da Liberdade. Considere apenas se tiver tempo extra."
  };
  
  return contexts[region] || "Região de Nova York";
}

// Helper: Extract preferences from historical programs
function extractPreferences(programs: Program[]): string {
  if (programs.length === 0) return "";
  
  const categories: { [key: string]: number } = {};
  const locations: { [key: string]: number } = {};
  
  programs.forEach(prog => {
    // Count locations
    if (prog.address) {
      const neighborhood = prog.address.split(",")[0];
      locations[neighborhood] = (locations[neighborhood] || 0) + 1;
    }
    
    // Detect categories from titles/descriptions
    const text = `${prog.title} ${prog.description || ""}`.toLowerCase();
    if (text.match(/museu|museum|art|arte/)) categories["museus"] = (categories["museus"] || 0) + 1;
    if (text.match(/parque|park|jardim|garden/)) categories["parques"] = (categories["parques"] || 0) + 1;
    if (text.match(/restaurante|food|comida|café/)) categories["gastronomia"] = (categories["gastronomia"] || 0) + 1;
    if (text.match(/show|teatro|broadway|música/)) categories["entretenimento"] = (categories["entretenimento"] || 0) + 1;
    if (text.match(/compra|shopping|loja|store/)) categories["compras"] = (categories["compras"] || 0) + 1;
  });
  
  const topCategories = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);
    
  const topLocations = Object.entries(locations)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([loc]) => loc);
  
  let prefs = "";
  if (topCategories.length > 0) {
    prefs += `\nCategorias que já visitaram/planejaram: ${topCategories.join(", ")}`;
  }
  if (topLocations.length > 0) {
    prefs += `\nLocais que já visitaram/planejaram: ${topLocations.join(", ")}`;
  }
  
  return prefs;
}

// Main function: Build complete travel context
export async function buildTravelContext(
  userId: string,
  supabaseUrl: string,
  supabaseKey: string,
  currentDate?: string,
  region?: string
): Promise<TravelContext> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Fetch travel profile
  const { data: profile } = await supabase
    .from("travel_profile")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  
  // Fetch trip config
  const { data: tripConfig } = await supabase
    .from("trip_config")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  
  // Fetch all programs
  const { data: programs } = await supabase
    .from("programs")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: true });
  
  return {
    profile: profile as TravelProfile | null,
    tripConfig: tripConfig as TripConfig | null,
    programs: (programs || []) as Program[],
    currentDate: currentDate || new Date().toISOString().split("T")[0],
    region: region || "Manhattan"
  };
}

// Main function: Build contextual prompt
export function buildContextualPrompt(context: TravelContext, specificContext?: string): string {
  const date = new Date(context.currentDate);
  const season = getSeason(date);
  const holiday = checkIfHoliday(date);
  const localContext = getLocalContext(context.region);
  const historicalPrefs = extractPreferences(context.programs);
  
  // Build traveler info
  let travelerInfo = "";
  if (context.profile?.travelers && context.profile.travelers.length > 0) {
    travelerInfo = "\n## VIAJANTES:\n";
    context.profile.travelers.forEach((t: any) => {
      travelerInfo += `- ${t.name}, ${t.age} anos`;
      if (t.interests && t.interests.length > 0) {
        travelerInfo += ` (interesses: ${t.interests.join(", ")})`;
      }
      travelerInfo += "\n";
    });
  }
  
  // Build restrictions
  let restrictions = "";
  if (context.profile?.dietary_restrictions && context.profile.dietary_restrictions.length > 0) {
    restrictions += `\n## RESTRIÇÕES ALIMENTARES (CRÍTICO):\n${context.profile.dietary_restrictions.map(r => `- ${r}`).join("\n")}`;
    restrictions += "\n⚠️ NUNCA ignore estas restrições! Sempre mencione opções compatíveis.";
  }
  
  if (context.profile?.mobility_notes) {
    restrictions += `\n## MOBILIDADE:\n${context.profile.mobility_notes}`;
  }
  
  if (context.profile?.avoid_topics && context.profile.avoid_topics.length > 0) {
    restrictions += `\n## TÓPICOS A EVITAR:\n${context.profile.avoid_topics.map(t => `- ${t}`).join("\n")}`;
  }
  
  // Build preferences
  let preferences = "";
  if (context.profile) {
    preferences += `\n## PREFERÊNCIAS:`;
    preferences += `\n- Ritmo de viagem: ${context.profile.pace === 'relaxed' ? 'Relaxado (menos atividades, mais tempo livre)' : context.profile.pace === 'moderate' ? 'Moderado (equilíbrio)' : 'Ativo (muitas atividades)'}`;
    preferences += `\n- Budget: ${context.profile.budget_level === 'budget' ? 'Econômico' : context.profile.budget_level === 'moderate' ? 'Moderado' : 'Luxo'}`;
    
    if (context.profile.interests && context.profile.interests.length > 0) {
      preferences += `\n- Interesses gerais: ${context.profile.interests.join(", ")}`;
    }
    
    if (context.profile.preferred_categories && context.profile.preferred_categories.length > 0) {
      preferences += `\n- Categorias preferidas: ${context.profile.preferred_categories.join(", ")}`;
    }
    
    if (context.profile.notes) {
      preferences += `\n- Notas adicionais: ${context.profile.notes}`;
    }
  }
  
  // Build trip context
  let tripContext = "";
  if (context.tripConfig) {
    tripContext += `\n## CONTEXTO DA VIAGEM:`;
    tripContext += `\n- Período: ${new Date(context.tripConfig.start_date).toLocaleDateString('pt-BR')} a ${new Date(context.tripConfig.end_date).toLocaleDateString('pt-BR')}`;
    if (context.tripConfig.hotel_address) {
      tripContext += `\n- Hotel: ${context.tripConfig.hotel_address}`;
      tripContext += `\n  → Use isto como referência para calcular distâncias e tempos de deslocamento`;
    }
  }
  
  // Build the complete prompt
  const prompt = `
# CONTEXTO COMPLETO DA VIAGEM A NOVA YORK

## DATA E ESTAÇÃO:
📅 Data atual: ${date.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
🌡️ Estação: ${season.name}
🌡️ Temperatura: ${season.temp}
👕 Vestuário recomendado: ${season.clothing}
💡 Dicas da estação: ${season.tips}
⚠️ Evitar: ${season.avoid}
${holiday ? `\n🎉 EVENTO ESPECIAL: ${holiday}` : ''}

## REGIÃO:
📍 ${context.region}
${localContext}

${tripContext}

${travelerInfo}

${preferences}

${restrictions}

${historicalPrefs}

${specificContext ? `\n## CONTEXTO ESPECÍFICO DESTA REQUISIÇÃO:\n${specificContext}` : ''}

---

# REGRAS CRÍTICAS DE VALIDAÇÃO (LEIA COM ATENÇÃO):

✅ **SEMPRE FAÇA ANTES DE RESPONDER:**
1. ⚠️⚠️⚠️ VALIDE A DATA PRIMEIRO: Se sugerir evento pontual (show, jogo, festival) → confirme que ocorre EXATAMENTE na data ${date.toLocaleDateString('pt-BR')}. Se for atração permanente → confirme que está ABERTA nesta data.
2. Verifique se a sugestão faz sentido para a ESTAÇÃO atual
3. Verifique se respeita TODAS as restrições alimentares
4. Verifique se é apropriado para as IDADES dos viajantes
5. Verifique se está alinhado com o RITMO e BUDGET preferidos
6. Verifique se NÃO inclui tópicos a evitar
7. Verifique se a REGIÃO faz sentido (distâncias, acessibilidade)

❌ **NUNCA:**
- ⚠️⚠️⚠️ NÃO sugira eventos pontuais (shows, jogos, festivais, apresentações) de datas DIFERENTES da requisitada - isto é o erro mais crítico!
- ⚠️⚠️⚠️ NÃO sugira locais FECHADOS na data especificada
- NÃO invente endereços, horários ou preços - use apenas informações verificáveis
- NÃO sugira atividades ao ar livre quando a estação não permitir (ex: picnic no inverno)
- NÃO ignore restrições alimentares - SEMPRE mencione se o local atende às restrições
- NÃO sugira atividades inadequadas para crianças se houver crianças no grupo
- NÃO preencha lacunas com informações genéricas ou desconexas
- NÃO sugira lugares muito distantes sem mencionar o tempo de deslocamento

✅ **SEMPRE:**
- Seja específico e factual
- Mencione considerações de clima quando relevante
- Indique tempo de deslocamento aproximado
- Sugira horários realistas considerando deslocamentos
- Adapte sugestões ao perfil da família
- Priorize segurança e conforto
- Seja honesto se não souber algo - não invente

---

Agora responda considerando TODO este contexto:
`;

  return prompt;
}
