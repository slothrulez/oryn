import type { NamespaceMessages } from "../config";

// projectsPage namespace: the full project list page (/projects) + the cross-project works feed
export const projectsPage: NamespaceMessages = {
  en: {
    pageTitle: "My projects",
    pageSubtitle: "Sorted by last edit — click to jump back to where you left off",
    newProject: "New project",
    searchPlaceholder: "Search projects or products…",
    untitled: "Untitled project",
    empty: "No projects yet",
    emptyDesc: "Start from the workspace with a product photo, or use the full form",
    goStart: "Go to workspace",
    goNew: "New via full form",
    noMatch: "No matching projects",
    loadError: "Failed to load projects",
    // projects / works dual view
    tabProjects: "Projects",
    tabWorks: "Works",
    worksEmpty: "No finished videos yet",
    worksEmptyDesc: "Every render lands here with a poster — find the one you need at a glance",
    worksCount: "{n} videos",
    download: "Download",
    deleteProject: "Delete project",
    deleteConfirm: "Delete project “{name}”? Its scripts, assets and renders will be removed permanently.",
    deleteFailed: "Delete failed — please retry",
  },
};
