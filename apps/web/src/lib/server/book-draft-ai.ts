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

async function requestOpenAiDraftSuggestions(
  project: Project,
  editorState: BookDraftEditorState,
) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
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

  return JSON.parse(outputText) as DraftSuggestionPayload;
}

function applyDraftSuggestions(
  project: Project,
  suggestions: DraftSuggestionPayload | null,
  editorState: BookDraftEditorState,
) {
  if (!suggestions) {
    return saveWorkingDraft(project, {
      bookDraft: {
        ...project.bookDraft,
      },
      draftEditorState: {
        ...editorState,
        aiProvider: "fallback",
        lastAiRefreshAt: new Date().toISOString(),
      },
    });
  }

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
      aiProvider: "openai",
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

  try {
    const suggestions = await requestOpenAiDraftSuggestions(rebuiltProject, editorState);
    return applyDraftSuggestions(rebuiltProject, suggestions, editorState);
  } catch {
    return applyDraftSuggestions(rebuiltProject, null, editorState);
  }
}
