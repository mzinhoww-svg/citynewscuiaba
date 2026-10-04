import type { AdminReply } from "../admin/AdminStatus";

/** Lugar como o admin do Guia o mostra (sem o que só o público usa). */
export interface AdminVenue {
  id: string;
  slug: string;
  name: string;
  category: string;
  subcategory: string | null;
  neighborhood: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  hours: string | null;
  sources: string[];
  rating: number | null;
  ratingCount: number | null;
  tripadvisorRank: number | null;
  status: "active" | "suspended" | "inactive";
  /** Foto oficial aprovada (id do ativo) ou `null` (cartão tipográfico). */
  photoMediaId: string | null;
}

export interface AdminListItem {
  position: number;
  venueId: string;
  name: string;
  neighborhood: string | null;
  score: number;
  breakdown: Record<string, number>;
  sources: string[];
  rating: number | null;
  ratingCount: number | null;
  tripadvisorRank: number | null;
  note: string | null;
  venueStatus: "active" | "suspended" | "inactive";
}

export interface AdminList {
  id: string;
  slug: string;
  title: string;
  intro: string | null;
  criteria: string;
  category: string;
  neighborhood: string | null;
  status: "proposal" | "draft" | "published" | "suspended" | "discarded";
  origin: "template" | "link" | "manual";
  sponsored: boolean;
  sponsorName: string | null;
  sponsorKind: "citynews" | "partner" | null;
  publishedAt: string | null;
  refreshedAt: string | null;
  nextRefreshAt: string | null;
  publishedBy: string | null;
  suspendedReason: string | null;
  createdAt: string;
  items: AdminListItem[];
}

export interface AdminProposal {
  id: string;
  origin: "template" | "link" | "manual";
  sourceUrl: string | null;
  createdAt: string;
  analysis: {
    sourceHost?: string;
    verifiedNames?: string[];
    discardedNames?: string[];
    criteriaKind?: string | null;
    missingForAutoPublish?: string[];
  } | null;
  list: AdminList;
}

export interface AdminTemplate {
  id: string;
  slug: string;
  title: string;
  noun: string;
  category: string;
  subcategory: string | null;
  neighborhood: string | null;
  take: number;
  minVenues: number;
  active: boolean;
  lastProposedAt: string | null;
}

export interface AdminReport {
  id: string;
  venueId: string;
  venueName: string;
  reason: string;
  contact: string | null;
  createdAt: string;
  suspendedLists: number;
}

export interface CategoryOption {
  slug: string;
  label: string;
}

export type Reply = Promise<AdminReply>;
