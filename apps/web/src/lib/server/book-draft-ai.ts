import {
  normalizeProjectDraftState,
  regenerateBookDraft,
  saveWorkingDraft,
  type BookDraftEditorState,
  type Project,
} from "@photo-book-maker/core";
import { deriveStoryChapters } from "@/lib/book-editor";

const OPENAI_RESPONSES_API_URL = "https://api.openai.com/v1/responses";
const OPENAI_DRAFT_MODEL = process.env.OPENAI_DRAFT_MODEL ?? "gpt-4.1-mini";
const LOCAL_AI_MODEL =
  process.env.LOCAL_AI_MODEL ?? process.env.OLLAMA_MODEL ?? "llama3.1:latest";

type AiDraftProvider = Exclude<
  NonNullable<BookDraftEditorState["aiProvider"]>,
  "manual"
>;

type DraftRefreshInput = {
  bookDraft?: Project["bookDraft"];
  draftEditorState?: BookDraftEditorState;
  selectedThemeId?: string;
  subtitle?: string;
  title?: string;
};

type DraftSuggestionPayload = {
  pageSuggestions: Array<{
    caption: string;
    pageId: string;
    title: string;
  }>;
  summary: string;
};

function normalizeLocalAiBaseUrl(value: string | null | undefined) {
  const rawValue = value?.trim();
  if (!rawValue) {
    return "http://127.0.0.1:11434";
  }

  const withProtocol = /^https?:\/\//i.test(rawValue)
    ? rawValue
    : `http://${rawValue}`;

  return withProtocol.replace(/\/$/, "");
}

function getLocalAiBaseUrl() {
  return normalizeLocalAiBaseUrl(
    process.env.LOCAL_AI_BASE_URL ??
      process.env.OLLAMA_BASE_URL ??
      process.env.OLLAMA_HOST,
  );
}

function getConfiguredAiProvider(): AiDraftProvider {
  const configuredProvider = (
    process.env.AI_DRAFT_PROVIDER ??
    (process.env.OPENAI_API_KEY?.trim() ? "openai" : "ollama")
  )
    .trim()
    .toLowerCase();

  if (configuredProvider === "openai") {
    return "openai";
  }

  if (configuredProvider === "local" || configuredProvider === "ollama") {
    return "ollama";
  }

  if (configuredProvider === "auto") {
    return process.env.OPENAI_API_KEY?.trim() ? "openai" : "ollama";
  }

  throw new Error(
    `AI draft refresh provider "${configuredProvider}" is not supported. Use "ollama", "local", "openai", or "auto".`,
  );
}

const BOOK_LAYOUT_SYSTEM_PROMPT = `You are BookLayoutAI, a premium photo-book art director for mobile memory books.

PRIMARY RULE
Never compose pages free-form. First build the story, then choose from an approved spread library, then crop safely, then score the result.

BOOK STRUCTURE
YEAR_RECAP: chapter by month, season, people, or theme.
TRIP: chapter by route, city/country, day, or theme.
Every chapter needs: opener -> hero -> support -> detail/grid -> closer.

HARD RULES
- One focal point per spread.
- Use whitespace; do not fill every slot.
- Keep hero captions short.
- Group food, candids, selfies, tickets, and repeated details into grids or memorabilia pages.
- Panoramas get standalone treatment.
- Alternate quiet spreads and dense spreads for rhythm.
- Use max 2 font families and 3 total font styles.
- Return concise, premium, human-sounding copy.

CAPTION FORMULA
Default caption = where + when + who + why it mattered.
Available tones: factual, warm, reflective, playful.

OUTPUT
Return JSON that matches the provided schema. Keep manual or confirmed copy untouched by omission.`;

function buildDraftSuggestionRequest(
  project: Project,
  editorState: BookDraftEditorState,
) {
  const chapters = deriveStoryChapters(project, editorState.storyMode);

  return {
    project: {
      title: project.title,
      subtitle: project.subtitle,
      type: project.type,
      timezone: project.timezone,
      range: {
        startDate: project.startDate,
        endDate: project.endDate,
      },
      theme: project.bookThemes.find((theme) => theme.id === project.selectedThemeId)?.name,
    },
    editor: {
      captionTone: editorState.captionTone,
      density: editorState.density,
      fontPresetId: editorState.fontPresetId,
      formatId: editorState.formatId,
      storyMode: editorState.storyMode,
      styleMode: editorState.styleMode,
      showDates: editorState.showDates,
      showLocations: editorState.showLocations,
      showChapterDividers: editorState.showChapterDividers,
    },
    chapters: chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      subtitle: chapter.subtitle,
      pageIds: chapter.pageIds,
    })),
    notes: project.notes.slice(0, 12).map((note) => ({
      title: note.title,
      body: note.body,
      createdAt: note.createdAt,
    })),
    photos: project.photos.slice(0, 60).map((photo) => ({
      id: photo.id,
      title: photo.title,
      capturedAt: photo.capturedAt,
      locationLabel: photo.locationLabel ?? null,
      orientation: photo.orientation,
      mustInclude: photo.mustInclude,
      qualityNotes: photo.qualityNotes,
      peopleCount: photo.peopleIds.length,
    })),
    pages: project.bookDraft.pages.map((page) => ({
      id: page.id,
      style: page.style,
      storyBeat: page.storyBeat,
      title: page.title,
      caption: page.caption,
      photoIds: page.photoIds,
      copyStatus: page.copyStatus,
      copySource: page.copySource,
      approved: page.approved,
      curationNote: page.curationNote,
      layoutNote: page.layoutNote,
    })),
  };
}

function extractResponseText(responseBody: unknown) {
  if (
    responseBody &&
    typeof responseBody === "object" &&
    "output_text" in responseBody &&
    typeof responseBody.output_text === "string"
  ) {
    return responseBody.output_text.trim();
  }

  if (
    responseBody &&
    typeof responseBody === "object" &&
    "output" in responseBody &&
    Array.isArray(responseBody.output)
  ) {
    const fragments = responseBody.output
      .flatMap((entry: unknown) => {
        if (!entry || typeof entry !== "object" || !("content" in entry) || !Array.isArray(entry.content)) {
          return [];
        }

        return entry.content
          .map((contentEntry: unknown) => {
            if (!contentEntry || typeof contentEntry !== "object") {
              return null;
            }

            if ("text" in contentEntry && typeof contentEntry.text === "string") {
              return contentEntry.text;
            }

            return null;
          })
          .filter((value: string | null): value is string => Boolean(value));
      })
      .join("\n")
      .trim();

    return fragments;
  }

  return "";
}

function extractOllamaResponseText(responseBody: unknown) {
  if (
    responseBody &&
    typeof responseBody === "object" &&
    "message" in responseBody &&
    responseBody.message &&
    typeof responseBody.message === "object" &&
    "content" in responseBody.message &&
    typeof responseBody.message.content === "string"
  ) {
    return responseBody.message.content.trim();
  }

  if (
    responseBody &&
    typeof responseBody === "object" &&
    "response" in responseBody &&
    typeof responseBody.response === "string"
  ) {
    return responseBody.response.trim();
  }

  return "";
}

function parseDraftSuggestionPayload(
  outputText: string,
  providerLabel: string,
): DraftSuggestionPayload {
  const trimmedText = outputText.trim();
  const candidateJson =
    trimmedText.startsWith("{") && trimmedText.endsWith("}")
      ? trimmedText
      : trimmedText.slice(trimmedText.indexOf("{"), trimmedText.lastIndexOf("}") + 1);

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(candidateJson);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON.";
    throw new Error(`${providerLabel} draft refresh returned invalid JSON: ${message}`);
  }

  if (!parsedPayload || typeof parsedPayload !== "object") {
    throw new Error(`${providerLabel} draft refresh returned an invalid payload.`);
  }

  const payload = parsedPayload as {
    pageSuggestions?: unknown;
    summary?: unknown;
  };

  const pageSuggestions = Array.isArray(payload.pageSuggestions)
    ? payload.pageSuggestions
        .map((suggestion) => {
          if (!suggestion || typeof suggestion !== "object") {
            return null;
          }

          const candidate = suggestion as {
            caption?: unknown;
            pageId?: unknown;
            title?: unknown;
          };

          if (
            typeof candidate.caption !== "string" ||
            typeof candidate.pageId !== "string" ||
            typeof candidate.title !== "string"
          ) {
            return null;
          }

          return {
            caption: candidate.caption,
            pageId: candidate.pageId,
            title: candidate.title,
          };
        })
        .filter((suggestion): suggestion is DraftSuggestionPayload["pageSuggestions"][number] =>
          Boolean(suggestion),
        )
    : [];

  return {
    pageSuggestions,
    summary: typeof payload.summary === "string" ? payload.summary : "",
  };
}

async function requestOpenAiDraftSuggestions(
  project: Project,
  editorState: BookDraftEditorState,
) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("AI draft refresh is not configured. Add OPENAI_API_KEY first.");
  }

  const response = await fetch(OPENAI_RESPONSES_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_DRAFT_MODEL,
      max_output_tokens: 1800,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: BOOK_LAYOUT_SYSTEM_PROMPT,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(buildDraftSuggestionRequest(project, editorState)),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "book_draft_suggestions",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              summary: {
                type: "string",
              },
              pageSuggestions: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    pageId: { type: "string" },
                    title: { type: "string" },
                    caption: { type: "string" },
                  },
                  required: ["pageId", "title", "caption"],
                },
              },
            },
            required: ["summary", "pageSuggestions"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI draft refresh failed: ${response.status} ${errorText}`);
  }

  const responseBody = (await response.json()) as unknown;
  const outputText = extractResponseText(responseBody);

  if (!outputText) {
    throw new Error("OpenAI draft refresh returned an empty response.");
  }

  return parseDraftSuggestionPayload(outputText, "OpenAI");
}

async function requestOllamaDraftSuggestions(
  project: Project,
  editorState: BookDraftEditorState,
) {
  const response = await fetch(`${getLocalAiBaseUrl()}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: LOCAL_AI_MODEL,
      stream: false,
      format: "json",
      options: {
        num_predict: 1800,
        temperature: 0.35,
      },
      messages: [
        {
          role: "system",
          content: `${BOOK_LAYOUT_SYSTEM_PROMPT}

Return only valid JSON with this exact shape:
{"summary":"string","pageSuggestions":[{"pageId":"string","title":"string","caption":"string"}]}`,
        },
        {
          role: "user",
          content: JSON.stringify(buildDraftSuggestionRequest(project, editorState)),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Local Ollama draft refresh failed: ${response.status} ${errorText}`,
    );
  }

  const responseBody = (await response.json()) as unknown;
  const outputText = extractOllamaResponseText(responseBody);

  if (!outputText) {
    throw new Error("Local Ollama draft refresh returned an empty response.");
  }

  return parseDraftSuggestionPayload(outputText, "Local Ollama");
}

async function requestDraftSuggestions(
  project: Project,
  editorState: BookDraftEditorState,
) {
  const provider = getConfiguredAiProvider();

  if (provider === "openai") {
    return {
      provider,
      suggestions: await requestOpenAiDraftSuggestions(project, editorState),
    };
  }

  return {
    provider,
    suggestions: await requestOllamaDraftSuggestions(project, editorState),
  };
}

function applyDraftSuggestions(
  project: Project,
  suggestions: DraftSuggestionPayload,
  editorState: BookDraftEditorState,
  provider: AiDraftProvider,
) {
  const pageSuggestions = new Map(
    suggestions.pageSuggestions.map((suggestion) => [suggestion.pageId, suggestion]),
  );

  const nextPages = project.bookDraft.pages.map((page) => {
    if (page.copySource === "manual" || page.copyStatus === "confirmed") {
      return page;
    }

    const suggestion = pageSuggestions.get(page.id);
    if (!suggestion) {
      return page;
    }

    return {
      ...page,
      title: suggestion.title.trim() || page.title,
      caption: suggestion.caption.trim() || page.caption,
      copyStatus: "prefilled" as const,
      copySource: "hybrid" as const,
    };
  });

  return saveWorkingDraft(project, {
    bookDraft: {
      ...project.bookDraft,
      summary: suggestions.summary.trim() || project.bookDraft.summary,
      pages: nextPages,
    },
    draftEditorState: {
      ...editorState,
      aiProvider: provider,
      lastAiRefreshAt: new Date().toISOString(),
    },
  });
}

export async function refreshProjectDraftWithAi(
  project: Project,
  payload: DraftRefreshInput,
) {
  const savedProject = saveWorkingDraft(normalizeProjectDraftState(project), payload);
  const rebuiltProject = regenerateBookDraft(savedProject);
  const editorState = rebuiltProject.draftEditorState ?? normalizeProjectDraftState(rebuiltProject).draftEditorState!;
  const { provider, suggestions } = await requestDraftSuggestions(
    rebuiltProject,
    editorState,
  );
  return applyDraftSuggestions(rebuiltProject, suggestions, editorState, provider);
}
