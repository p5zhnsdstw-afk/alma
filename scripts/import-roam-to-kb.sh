#!/bin/bash
# Import valuable Roam Research content into claude-kb
# Skips empty stubs, routes business/personal knowledge
# Source: /Users/colo/Downloads/Roam-Export-1772030911400/

KB="python3 /Users/colo/.claude/knowledge/claude-kb"
ROAM="/Users/colo/Downloads/Roam-Export-1772030911400"

echo "=== Roam → claude-kb Import ==="
echo ""

# 1. Home layout → Alma seed data (handled by import-roam-home-profile.ts)
echo ">>> Home layout: handled by import-roam-home-profile.ts (Alma seed)"
echo ""

# 2. Grupo Tracklink structure
echo ">>> Tracklink group structure..."
$KB learn "Grupo Tracklink: Ecuador, Peru, Honduras, Nicaragua, GTS. Chile y Costa Rica pendientes." \
  --project "Tracklink" \
  --content "From Roam (2020-2024). Countries: Ecuador, Peru, Honduras, Nicaragua, GTS as core. Chile entry and Costa Rica status were open questions. This is the historical group structure."

# 3. YPO Forum context (from September 20th, 2023)
echo ">>> YPO Forum context..."
$KB learn "YPO Forum: Robert's forum group members and structure" \
  --project "Personal" \
  --content "Members: Robert Wright (RAW), Juan Pablo Ortiz (JPO), Manuel Kronfle (MKK), Luis Fernando Gomez (LFG), Carlos Andres Piovesan (CAP), Juan Xavier Estrada (JXE), Andres Pino (AP), Xavier Peña (XP). Rules: 2 justified absences max, 3rd = invite everyone at club, 4th = out. One zoom connection allowed (health). Meeting frequency: monthly. From Roam Research 2023-2024."

# 4. Robert's personal objectives (from YPO retreat)
echo ">>> Robert's YPO objectives..."
$KB learn "Robert's YPO retreat objectives (2023): LTP, meditation, singing, resolving duality" \
  --project "Personal" \
  --content "1. Hacer el LTP de mi Life Purpose. 2. Hacer habito: meditar, cursos de mercadeo, cantar una vez por semana. 3. Resolver mi dualidad actual. From Sept 2023 retreat planning."

# 5. Robert's business values
echo ">>> Robert's core values..."
$KB learn "Robert's core leadership values: Empoderamiento, Avanzar, Respeto, Justicia" \
  --project "Personal" \
  --content "From YPO Forum values exercise (Nov 2023). Robert listed: Empoderamiento, Avanzar, Respeto, Justicia."

# 6. Key recurring concern: Tracklink Ecuador
echo ">>> Tracklink Ecuador recurring concern..."
$KB learn "Historical: Tracklink Ecuador was Robert's primary concern through 2023-2024" \
  --project "Tracklink" \
  --content "Recurring across multiple YPO forum updates (Sept 2023, Nov 2023, Jan 2024, Feb 2024). Issues: execution speed, lost in translation, lack of flywheel, lost market participation, work team problems. Main source of frustration. Main income source. From Roam Research forum notes."

# 7. Gym business (SmartFit reference)
echo ">>> Gym business context..."
$KB learn "Historical: Gym business was flying by Jan 2024, Bolivia expansion being evaluated (20-25 locations)" \
  --project "SmartFit" \
  --content "From Jan 2024 YPO update: gyms are growing well, evaluating Bolivia for 20-25 total locations. Contrasts with Tracklink Ecuador stress. From Roam Research."

# 8. Robert's family context
echo ">>> Family context..."
$KB learn "Robert's family: wife Maria Isabel, father turning 70 (2024), children K, I, O" \
  --project "Personal" \
  --content "From Roam (2023-2024). Wife: Maria Isabel (sometimes irritable, possible hormonal). Father: 70th birthday trip to Casa de Campo for golf (Jan 2024). Children rooms: Cuarto K&I, Cuarto O. RD family trip was a highlight. Golf with dad is important."

# 9. Opera/singing as personal passion
echo ">>> Personal: Opera..."
$KB learn "Robert sings opera — started 2023, brings joy and curiosity" \
  --project "Personal" \
  --content "Started late 2023. Recurring across multiple forum updates as Greatest Joy. Wants to learn technique, eventually give a concert. Finds it similar to business: lots of bullshit but real technique underneath. From Roam Research 2023-2024."

# 10. Health/wellness interest
echo ">>> Personal: Health interests..."
$KB learn "Robert interested in Gary Brecka health approach, wants to lose weight" \
  --project "Personal" \
  --content "From Nov 2023 YPO update. Interested in Gary Brecka's health information. Wants to understand weight loss process better. Also had hormones discussion in forum parking lot (Xavier Peña - growth hormones). From Roam Research."

echo ""
echo "=== Import complete: 10 knowledge nodes created ==="
echo "Run 'claude-kb brief Personal' and 'claude-kb brief Tracklink' to verify."
