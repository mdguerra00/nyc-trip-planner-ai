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
  // 1. Boroughs principais
  const boroughContexts: { [key: string]: string } = {
    "Manhattan": "Centro de NYC, ilha densamente povoada com principais atrações turísticas, business district, teatros da Broadway, museus mundialmente famosos.",
    "Brooklyn": "Do outro lado do East River. Brooklyn Bridge, Prospect Park, DUMBO, Williamsburg (bairro hipster), Coney Island (praia e parque de diversões).",
    "Queens": "Borough mais diverso etnicamente. Flushing Meadows Park, US Open (tênis), aeroportos JFK e LaGuardia.",
    "Bronx": "Norte de Manhattan. Yankee Stadium, Bronx Zoo (um dos maiores zoológicos do mundo), Jardim Botânico.",
    "Staten Island": "Menos turístico, mais residencial. Ferry gratuito com vista da Estátua da Liberdade."
  };
  
  // 2. Bairros e pontos específicos de Manhattan e NYC
  const neighborhoodContexts: { [key: string]: string } = {
    "Columbus Circle": "Canto sudoeste do Central Park (59th St & Broadway). Próximo: Central Park (caminhada), Lincoln Center (5 min), Time Warner Center (no local), Hell's Kitchen (10 min oeste). Metrô: A/C/D/1 lines.",
    "Times Square": "Centro de Midtown (42nd St & Broadway). Próximo: Teatro District, Rockefeller Center (10 min norte), Bryant Park (5 min leste), Hell's Kitchen (10 min oeste). Metrô: N/Q/R/W/S/1/2/3/7.",
    "Central Park": "Enorme parque de 59th a 110th St. Próximo: Upper West/East Side, Museums Mile (leste), Columbus Circle (sul). Metrô: várias linhas nas bordas.",
    "SoHo": "Sul de Houston St. Arte, moda, arquitetura. Próximo: Tribeca (sul), Greenwich Village (norte), Chinatown (leste). Metrô: N/R/W, 6, A/C/E.",
    "Greenwich Village": "Bairro boêmio. Washington Square Park. Próximo: SoHo (sul), Chelsea (oeste), Union Square (norte). Metrô: A/C/E/B/D/F/M.",
    "Upper West Side": "Entre Central Park e Hudson River, 59th-110th St. Próximo: Central Park, Lincoln Center, Museum of Natural History. Metrô: 1/2/3, B/C.",
    "Upper East Side": "Entre Central Park e East River, 59th-96th St. Museums Mile. Próximo: Central Park, Metropolitan Museum. Metrô: 4/5/6, Q.",
    "Chelsea": "West 14th-34th St. High Line, galerias, Chelsea Market. Próximo: Greenwich Village (sul), Hell's Kitchen (norte). Metrô: A/C/E, 1/2/3.",
    "Midtown": "34th-59th St. Coração comercial. Empire State, Rockefeller, Times Square, Bryant Park. Metrô: todas as linhas principais.",
    "Financial District": "Sul de Manhattan. Wall Street, 9/11 Memorial, Battery Park. Próximo: Tribeca (norte), Brooklyn via ponte. Metrô: 1/2/3/4/5, R/W.",
    "Tribeca": "Triangle Below Canal. Restaurantes, filmes. Próximo: SoHo (norte), Financial District (sul). Metrô: 1/2/3, A/C/E.",
    "Chinatown": "Canal St area. Comida, cultura. Próximo: Little Italy (norte), Lower East Side (leste), Tribeca (oeste). Metrô: N/R/W, J/Z, 6.",
    "Brooklyn Heights": "Promenade com vista incrível de Manhattan. Próximo: DUMBO (leste), Downtown Brooklyn (sudeste). Metrô: 2/3, A/C, F.",
    "DUMBO": "Down Under Manhattan Bridge Overpass. Arte, vista, Brooklyn Bridge Park. Próximo: Brooklyn Heights (oeste). Metrô: F, A/C.",
    "Williamsburg": "Hipster, arte, música, comida. Norte do Brooklyn. Metrô: L train, J/M/Z.",
    "Coney Island": "Praia, boardwalk, parque de diversões. Extremo sul do Brooklyn. Metrô: D/F/N/Q (fim da linha).",
    "Hell's Kitchen": "West 34th-59th St (oeste de Midtown). Restaurantes diversos, teatro off-Broadway. Próximo: Times Square (leste), Hudson Yards (sul). Metrô: A/C/E, 1/2/3.",
    "East Village": "Leste da Broadway, abaixo de 14th St. Bares, música ao vivo, Tompkins Square Park. Próximo: Greenwich Village (oeste), Lower East Side (sul). Metrô: L, 6, N/R/W.",
    "Lower East Side": "Sul do East Village. História de imigração, nightlife, shopping alternativo. Próximo: Chinatown (oeste), Williamsburg via ponte. Metrô: F, J/M/Z.",
    "Harlem": "Norte de Manhattan (acima de 110th St). Cultura afro-americana, Apollo Theater, soul food. Próximo: Columbia University (sul), Bronx (norte). Metrô: 2/3, A/B/C/D.",
    "Hudson Yards": "Novo desenvolvimento em West Side (30th-34th St). The Vessel, The Shed, shopping. Próximo: Chelsea (sul), Hell's Kitchen (norte). Metrô: 7 train."
  };
  
  // 3. Verificar se é ponto específico conhecido
  const regionLower = region.trim();
  
  // Match exato (case-insensitive)
  for (const [key, value] of Object.entries(neighborhoodContexts)) {
    if (regionLower.toLowerCase() === key.toLowerCase()) {
      return value;
    }
  }
  
  // Match parcial (ex: "central park south" -> "Central Park")
  for (const [key, value] of Object.entries(neighborhoodContexts)) {
    if (regionLower.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }
  
  // Se for um dos boroughs
  for (const [key, value] of Object.entries(boroughContexts)) {
    if (regionLower.toLowerCase() === key.toLowerCase()) {
      return value;
    }
  }
  
  // 4. Fallback inteligente
  return `Ponto específico em Nova York: "${region}". Busque atrações PRÓXIMAS a este local (raio de 10-15 minutos a pé). Priorize opções caminháveis e mencione distâncias/tempos de deslocamento.`;
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
