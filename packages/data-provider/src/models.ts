import { z } from 'zod';
import type { TPreset } from './schemas';
import {
  EModelEndpoint,
  tPresetSchema,
  eModelEndpointSchema,
  AuthType,
  authTypeSchema,
} from './schemas';

export type TModelSpec = {
  name: string;
  label: string;
  preset: TPreset;
  order?: number;
  default?: boolean;
  description?: string;
  placeholder?: string;
  /**
   * Optional group name for organizing specs in the UI selector.
   * - If it matches an endpoint name (e.g., "openAI", "groq"), the spec appears nested under that endpoint
   * - If it's a custom name (doesn't match any endpoint), it creates a separate collapsible group
   * - If omitted, the spec appears as a standalone item at the top level
   */
  group?: string;
  /**
   * Optional icon URL for the group this spec belongs to.
   * Only needs to be set on one spec per group - the first one found with a groupIcon will be used.
   * Can be a URL or an endpoint name to use its icon.
   */
  groupIcon?: string | EModelEndpoint;
  showIconInMenu?: boolean;
  showIconInHeader?: boolean;
  showSwitchAgent?: boolean;
  limitBadge?: {
    messages?: string;
    tokens?: string;
  };
  conversationStarterCategories?: Array<{
    label: string;
    description?: string;
    icon?: string;
    starters: string[];
  }>;
  conversation_starters?: string[];
  iconURL?: string | EModelEndpoint; // Allow using project-included icons
  authType?: AuthType;
  webSearch?: boolean;
  fileSearch?: boolean;
  executeCode?: boolean;
  artifacts?: string | boolean;
  mcpServers?: string[];
};

const tConversationStarterCategorySchema = z.object({
  label: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  starters: z.array(z.string()),
});

export const tModelSpecSchema = z.object({
  name: z.string(),
  label: z.string(),
  preset: tPresetSchema,
  order: z.number().optional(),
  default: z.boolean().optional(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  group: z.string().optional(),
  groupIcon: z.union([z.string(), eModelEndpointSchema]).optional(),
  showIconInMenu: z.boolean().optional(),
  showIconInHeader: z.boolean().optional(),
  showSwitchAgent: z.boolean().optional(),
  limitBadge: z
    .object({
      messages: z.string().optional(),
      tokens: z.string().optional(),
    })
    .optional(),
  conversationStarterCategories: z.array(tConversationStarterCategorySchema).optional(),
  conversation_starters: z.array(z.string()).optional(),
  iconURL: z.union([z.string(), eModelEndpointSchema]).optional(),
  authType: authTypeSchema.optional(),
  webSearch: z.boolean().optional(),
  fileSearch: z.boolean().optional(),
  executeCode: z.boolean().optional(),
  artifacts: z.union([z.string(), z.boolean()]).optional(),
  mcpServers: z.array(z.string()).optional(),
});

export const specsConfigSchema = z.object({
  enforce: z.boolean().default(false),
  prioritize: z.boolean().default(true),
  list: z.array(tModelSpecSchema).min(1),
  addedEndpoints: z.array(z.union([z.string(), eModelEndpointSchema])).optional(),
});

export type TSpecsConfig = z.infer<typeof specsConfigSchema>;
