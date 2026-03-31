"use client";

import type {
  BookDraftEditorState,
  BookDraftFormatId,
  BookPage,
  PhotoAsset,
  Project,
} from "@photo-book-maker/core";
import type { CSSProperties } from "react";
import { getCanvasAspectRatio, selectStoryLayout } from "@/lib/story-layout-engine";

type ThemePresentation = {
  canvasStyle: CSSProperties;
  textColor: string;
  textMuted: string;
};

export function StorybookPageCanvas({
  accent,
  editorState,
  formatId,
  mode = "preview",
  onSelectPhoto,
  page,
  photos,
  project,
  selectedPhotoId,
  shellStyle,
  themePresentation,
}: {
  accent: string;
  editorState: BookDraftEditorState;
  formatId: BookDraftFormatId;
  mode?: "editor" | "preview";
  onSelectPhoto?: (photoId: string) => void;
  page: BookPage;
  photos: PhotoAsset[];
  project: Project;
  selectedPhotoId?: string;
  shellStyle?: CSSProperties;
  themePresentation: ThemePresentation;
}) {
  const layout = selectStoryLayout(page, photos, project, editorState);
  const activeLayout = layout.active;
  const aspectRatio = getCanvasAspectRatio(formatId);

  return (
    <div
      className="relative mx-auto w-full overflow-hidden rounded-[2rem] border border-white/55 bg-white/86 p-4"
      style={shellStyle}
    >
      {editorState.printPreviewMode !== "clean" ? (
        <PrintGuides formatId={formatId} mode={editorState.printPreviewMode} />
      ) : null}

      <div
        className="relative overflow-hidden rounded-[1.7rem] border border-black/5"
        style={{
          ...themePresentation.canvasStyle,
          aspectRatio,
          background: activeLayout.style.background,
          padding: `${activeLayout.style.padding}px`,
        }}
      >
        {activeLayout.elements.map((element) => {
          const elementStyle: CSSProperties = {
            height: `${element.position.h * 100}%`,
            left: `${element.position.x * 100}%`,
            position: "absolute",
            top: `${element.position.y * 100}%`,
            width: `${element.position.w * 100}%`,
            zIndex: element.zIndex,
          };

          if (element.type === "image") {
            const imageBody = (
              <>
                {element.photo?.imageUri ? (
                  <img
                    src={element.photo.imageUri}
                    alt={element.photo.title}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.92),rgba(228,220,210,0.98))]" />
                )}
                <div
                  className={`absolute inset-0 ${element.variant === "hero" ? "bg-[linear-gradient(180deg,rgba(18,14,10,0.02),rgba(18,14,10,0.14))]" : "bg-[linear-gradient(180deg,rgba(18,14,10,0.01),rgba(18,14,10,0.08))]"}`}
                />
                {mode === "editor" && element.photo?.id === selectedPhotoId ? (
                  <div className="absolute right-3 top-3 rounded-full bg-[rgba(255,247,241,0.96)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8f4f2e]">
                    selected
                  </div>
                ) : null}
              </>
            );

            const imageClass = `group absolute overflow-hidden rounded-[1.55rem] border ${
              mode === "editor" && element.photo?.id === selectedPhotoId
                ? "border-[#8f4f2e66] shadow-[0_0_0_3px_rgba(143,79,46,0.16)]"
                : "border-white/40 shadow-[0_14px_28px_rgba(30,21,15,0.08)]"
            }`;

            if (mode === "editor" && element.photo?.id && onSelectPhoto) {
              return (
                <button
                  key={element.id}
                  type="button"
                  onClick={() => onSelectPhoto(element.photo!.id)}
                  className={imageClass}
                  style={{
                    ...elementStyle,
                    boxShadow:
                      mode === "editor" && element.photo?.id === selectedPhotoId
                        ? undefined
                        : `inset 0 0 0 1px ${accent}18`,
                  }}
                >
                  {imageBody}
                </button>
              );
            }

            return (
              <div
                key={element.id}
                className={imageClass}
                style={{
                  ...elementStyle,
                  boxShadow: `inset 0 0 0 1px ${accent}18`,
                }}
              >
                {imageBody}
              </div>
            );
          }

          const textClass =
            element.variant === "overlay"
              ? "rounded-[1.25rem] border border-white/18 bg-[rgba(18,14,10,0.42)] text-[#fff8f1] shadow-[0_16px_28px_rgba(18,14,10,0.16)] backdrop-blur-sm"
              : element.variant === "strip"
                ? "rounded-[1.1rem] border border-black/5 bg-white/84"
                : "rounded-[1.35rem] border border-black/5 bg-[linear-gradient(180deg,rgba(255,251,247,0.98),rgba(243,233,223,0.96))] shadow-[0_10px_22px_rgba(31,23,18,0.06)]";

          const eyebrowColor =
            element.variant === "overlay" ? "#f4ddca" : themePresentation.textMuted;
          const titleColor =
            element.variant === "overlay" ? "#fff8f1" : themePresentation.textColor;
          const bodyColor =
            element.variant === "overlay" ? "#f5e7db" : themePresentation.textMuted;

          return (
            <div
              key={element.id}
              className={`absolute flex h-full flex-col justify-between px-4 py-4 ${textClass}`}
              style={elementStyle}
            >
              <div>
                {element.eyebrow ? (
                  <div className="text-[10px] uppercase tracking-[0.22em]" style={{ color: eyebrowColor }}>
                    {element.eyebrow}
                  </div>
                ) : null}
                {element.title ? (
                  <div
                    className={`mt-2 ${element.variant === "strip" ? "text-sm" : "text-[1rem]"} font-semibold leading-tight`}
                    style={{ color: titleColor }}
                  >
                    {element.title}
                  </div>
                ) : null}
              </div>
              {element.body ? (
                <p
                  className={`${element.variant === "strip" ? "mt-2 text-[11px]" : "mt-3 text-[11px]"} leading-[1.45]`}
                  style={{ color: bodyColor }}
                >
                  {element.body}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PrintGuides({
  formatId,
  mode,
}: {
  formatId: BookDraftFormatId;
  mode: BookDraftEditorState["printPreviewMode"];
}) {
  const isLandscape = formatId === "11x8.5-landscape";

  return (
    <div className="pointer-events-none absolute inset-0 z-20 rounded-[2rem]">
      {mode === "bleed" ? (
        <div className="absolute inset-[2.1%] rounded-[1.75rem] border border-dashed border-[#d37d4f66]" />
      ) : null}
      <div className="absolute inset-[6%] rounded-[1.45rem] border border-dashed border-[#8f4f2e40]" />
      <div
        className={`absolute bottom-[6%] top-[6%] left-1/2 w-px -translate-x-1/2 ${isLandscape ? "bg-[#8f4f2e38]" : "bg-[#8f4f2e44]"}`}
      />
      <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-[#ecd0bf] bg-[#fff7f1] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8f4f2e]">
        {mode === "bleed" ? "Bleed + safe preview" : "Print-safe preview"}
      </div>
    </div>
  );
}

