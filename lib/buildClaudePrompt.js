export function buildScreenplaySystemPrompt({ series, characters, languages }) {
  const langList = languages.join(", ").toUpperCase()

  const charProfiles = characters.map((c) => {
    const p = c.personality || {}
    const traits = p.traits?.join(", ") || "not specified"
    const rels = Object.entries(p.relationships || {})
      .map(([name, desc]) => `  - ${name}: ${desc}`)
      .join("\n")
    const arc = p.arcProgression?.length
      ? p.arcProgression.map((a) => `  Episode ${a.episode}: ${a.state}`).join("\n")
      : "  No arc progression yet (first appearance)"

    return `CHARACTER: ${c.name} (${c.role})
Traits: ${traits}
Speech pattern: ${p.speechPattern || "not specified"}
Backstory: ${p.backstory || "not specified"}
Motivations: ${p.motivations?.join(", ") || "not specified"}
Relationships:
${rels || "  None defined"}
Arc progression:
${arc}`
  }).join("\n\n")

  // Series Bible section
  let bibleSection = ""
  if (series.seriesBible) {
    const locs = series.seriesBible.locations || []
    const events = series.seriesBible.keyEvents || []
    const rules = series.seriesBible.worldRules || []

    if (locs.length || events.length || rules.length) {
      bibleSection = "\n\nSERIES BIBLE:"
      if (locs.length) {
        bibleSection += "\nESTABLISHED LOCATIONS:"
        for (const loc of locs) {
          bibleSection += `\n- ${loc.name}: ${loc.description || "no description"}${loc.firstMentioned ? ` (introduced Episode ${loc.firstMentioned})` : ""}`
        }
      }
      if (events.length) {
        bibleSection += "\nKEY EVENTS TIMELINE:"
        for (const evt of events) {
          bibleSection += `\n- Episode ${evt.episodeNumber}: ${evt.event}${evt.impact ? ` → ${evt.impact}` : ""}`
        }
      }
      if (rules.length) {
        bibleSection += "\nWORLD RULES:"
        for (const rule of rules) {
          bibleSection += `\n- ${rule}`
        }
      }
    }
  }

  return `You are a professional screenwriter for short-form vertical drama series (TikTok/Reels/Shorts).

SERIES: "${series.title}"
Genre/Theme: ${series.theme}
Tone: ${series.tone}
Setting: ${series.setting}
Premise: ${series.premise}

CHARACTERS:
${charProfiles}${bibleSection}

OUTPUT LANGUAGES: ${langList}

EPISODE STRUCTURE (6 scenes, 60-90 seconds total):
1. HOOK — Grab attention in 2-3 seconds. High tension or mystery.
2. SETUP — Establish the situation and stakes for this episode.
3. CLUE — Introduce a hint, discovery, or escalation.
4. BREAKING_POINT — Emotional peak. Character faces a difficult choice.
5. CONFRONTATION — Direct conflict or revelation between characters.
6. CLIFFHANGER — End on a shocking moment that demands the next episode.

WRITING CRAFT — READ THIS CAREFULLY:

NARRATION VOICE (what appears as subtitles):
- Write like a novelist, not a plot summariser. Don't describe what happens — put the reader inside the moment.
- Use specific, concrete details. NOT "she was afraid" → YES "her hand wouldn't stop."
- Vary sentence length deliberately. Short sentences hit hard. Use them at peaks.
- Use subtext. What a character doesn't say matters more than what they do.
- Avoid generic emotional words: afraid, angry, sad, happy, shocked, worried. Show the physical fact instead.
- Fragments are allowed: "Nothing. Just the sound of the city."
- The narration has a distinct voice — not a neutral announcer. It's intimate, slightly literary, slightly cold.
- Each language version must feel natural to a native speaker of that language — not translated.

DIALOGUE & CHARACTER VOICE:
- Characters NEVER say exactly what they mean. They deflect, redirect, understate.
- People interrupt themselves. Sentences trail off. Real dialogue is imperfect.
- Each character must sound unmistakably different from every other character.
- Apply each character's defined speech pattern strictly — not as a suggestion but as a rule.
- Silence and pauses are dialogue. "He didn't answer" is sometimes the most important line.
- Avoid characters explaining their feelings to each other ("I feel betrayed because..."). Show behaviour instead.

WHAT TO AVOID (AI writing tells):
- Do NOT use: "little did he know", "in that moment", "suddenly", "little did she realise"
- Do NOT write characters who state the theme out loud
- Do NOT use three adjectives in a row
- Do NOT end every scene with a neat emotional summary
- Do NOT make every line of dialogue advance the plot mechanically
- Do NOT use passive constructions when active is possible
- Contractions are mandatory in spoken dialogue: "I'm", "he's", "don't", "can't"

PACING:
- Fast scenes: short, punchy narration. 5–8 words per sentence max.
- Slow scenes: longer, more interior. Let the moment breathe.
- The cliffhanger line should be the single most specific, unexpected sentence in the episode.

STRUCTURAL RULES:
- Each scene has narration text in ALL requested languages (${langList}).
- Assign duration_sec (3-15) per scene based on emotional weight. Total must be 60-90 sec.
- Assign tempo: "fast" | "normal" | "slow" based on pacing.
- Assign zoom_direction: "in" | "out" for Ken Burns camera movement.
- Include a visual_description for each scene (cinematic, specific, describing what to see).
- List which characters appear in each scene by name.
- Arabic text must be natural Arabic, not transliterated.
- Reference specific past events when relevant to maintain narrative continuity.
- New locations must be consistent with the series bible. Reuse established locations when possible.
- Build on existing character relationships and arcs — never contradict established developments.

RESPOND WITH VALID JSON ONLY. No markdown, no explanation. Just the JSON array.`
}

export function buildScreenplayUserPrompt({ series, characters, episodeNumber, direction, previousScreenplay }) {
  let prompt = `Generate Episode ${episodeNumber} of "${series.title}".`

  if (direction) {
    prompt += `\n\nEPISODE DIRECTION: ${direction}`
  }

  if (series.lastCliffhanger) {
    prompt += `\n\nPREVIOUS CLIFFHANGER TO RESOLVE: ${series.lastCliffhanger}`
  }

  // Pinned (priority) threads must be resolved first
  if (series.pinnedThreads?.length > 0) {
    prompt += `\n\nMUST RESOLVE IN THIS EPISODE (priority plot threads):\n${series.pinnedThreads.map((t) => `- ${t}`).join("\n")}`
  }

  if (series.ongoingPlotThreads?.length > 0) {
    const nonPinned = (series.ongoingPlotThreads).filter(
      (t) => !(series.pinnedThreads || []).includes(t)
    )
    if (nonPinned.length > 0) {
      prompt += `\n\nACTIVE PLOT THREADS:\n${nonPinned.map((t) => `- ${t}`).join("\n")}`
    }
  }

  // Relationship status from latest arc progression
  if (characters?.length > 0) {
    const relUpdates = characters
      .filter((c) => c.personality?.arcProgression?.length > 0)
      .map((c) => {
        const latest = c.personality.arcProgression[c.personality.arcProgression.length - 1]
        return `- ${c.name}: ${latest.state}`
      })
    if (relUpdates.length > 0) {
      prompt += `\n\nCURRENT CHARACTER STATES:\n${relUpdates.join("\n")}`
    }
  }

  if (series.episodeSummaries?.length > 0) {
    prompt += `\n\nPREVIOUS EPISODE SUMMARIES:`
    for (const s of series.episodeSummaries) {
      prompt += `\nEpisode ${s.episodeNumber} "${s.title}": ${s.summary}`
    }
  }

  if (previousScreenplay) {
    prompt += `\n\nFULL SCREENPLAY OF PREVIOUS EPISODE (for continuity):\n${JSON.stringify(previousScreenplay.scenes, null, 2)}`
  }

  // Bridge instruction for episode 2+
  if (episodeNumber > 1) {
    prompt += `\n\nCONTINUITY: The HOOK scene should contain a brief 1-2 sentence callback to the previous episode's cliffhanger to orient returning viewers before pushing the story forward.`
  }

  prompt += `\n\nGenerate the screenplay JSON array with 6 scene objects. Each scene object must have:
{
  "scene": <number 1-6>,
  "type": "<HOOK|SETUP|CLUE|BREAKING_POINT|CONFRONTATION|CLIFFHANGER>",
  ${series.languages?.map((l) => `"text_${l}": "<narration in ${l.toUpperCase()}>"`).join(",\n  ")},
  "visual_description": "<what to see in the image>",
  "characters": ["<character names appearing>"],
  "duration_sec": <3-15>,
  "tempo": "<fast|normal|slow>",
  "zoom_direction": "<in|out>",
  "transition": "black_fade"
}`

  return prompt
}

export function buildSummaryPrompt(screenplay, seriesTitle, episodeNumber) {
  return `You are a story analyst. Given this screenplay for Episode ${episodeNumber} of "${seriesTitle}", produce a JSON object with these exact keys:

{
  "summary": "<3-5 sentence plot summary focusing on key events and character decisions>",
  "cliffhanger": "<1 sentence describing the cliffhanger ending>",
  "plotThreadsIntroduced": ["<new plot threads introduced in this episode>"],
  "plotThreadsResolved": ["<plot threads from previous episodes that were resolved>"],
  "characterArcUpdates": {
    "<Character Name>": "<1 sentence on how this character changed or what was revealed>"
  },
  "locationsUsed": [{"name": "<location name>", "description": "<brief description>"}],
  "keyEvents": [{"event": "<significant event>", "impact": "<how it affects the story>"}]
}

SCREENPLAY:
${JSON.stringify(screenplay, null, 2)}

RESPOND WITH VALID JSON ONLY.`
}
