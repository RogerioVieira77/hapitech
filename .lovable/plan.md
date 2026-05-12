

# AI Agents SaaS Platform

## Overview
A complete AI Agents management platform with sidebar navigation, real-time chat testing, knowledge base management, and CRM capabilities. Built with authentication, database persistence, and Lovable AI integration for the agent chat functionality.

---

## Phase 1: Foundation & Authentication

### User Authentication
- Email/password signup and login pages
- Protected routes requiring authentication
- User profiles table for storing display name and preferences

### Sidebar Navigation Layout
- Persistent sidebar with icons for all 6 main sections: Dashboard, Meus Agentes, Base de Conhecimento, Integrações, CRM & Chat, Financeiro
- Collapsible sidebar with mini icon-only mode
- Active route highlighting

---

## Phase 2: Dashboard (Visão Geral)

### KPI Cards Row
- Total de Mensagens (mês), Leads Capturados, Créditos Disponíveis, Economia de Tempo
- Each card with icon, value, and percentage change indicator

### Activity Charts
- Area chart showing daily message volume (using Recharts)

### Recent Activity Feed
- Last 5 conversations with lead name and agent info
- Agent status panel showing online/offline state

### Tips & Tutorials Section
- Cards linking to guides on improving agent prompts (placeholder content)

---

## Phase 3: Meus Agentes (Agent Management)

### Agent Grid View
- Cards for each agent with avatar, name, AI model label, and quick action buttons (Edit, Test, Pause)
- "Create New Agent" button

### Agent Editor (Split-View)
- **Left panel:** Identity (name, personality instructions), model selection dropdown (GPT-4o, Gemini, Claude labels), creativity slider (temperature), conversation starters configuration
- **Right panel:** Live chat testing area powered by Lovable AI, where users can interact with their agent in real-time using the configured personality and instructions

### Database
- `agents` table storing agent configurations (name, instructions, model, temperature, status, conversation starters)

---

## Phase 4: Base de Conhecimento (Knowledge Base)

### Upload Sources (Tabs: Files vs URLs)
- **Files tab:** Drag-and-drop zone for PDF, TXT, CSV uploads (stored in Supabase Storage)
- **URLs tab:** URL input field with "Extract Content" button (UI only for now, extraction placeholder)

### Document Manager (DataTable)
- Sortable/filterable table with columns: File Name, Status (Processed/Error), Size, Actions (Delete, View Content)

### RAG Configuration
- Toggle: "Respond only from knowledge base" vs "Use general knowledge + knowledge base"

### Database
- `knowledge_documents` table (file name, file URL, status, size, agent association)
- Supabase Storage bucket for uploaded files

---

## Phase 5: Integrações (Integrations)

### Social Connections
- **WhatsApp card:** "Connect via QR Code" button with connection status indicator (UI mockup only)
- **Instagram/Facebook cards:** Meta Business login buttons (UI mockup only)

### Web Widget Customizer
- Color pickers for bubble color, text color, and icon selection
- Live preview of the chat widget appearance
- Copyable embed code snippet (generated `<script>` tag)

### API/Webhooks
- Form to add webhook URLs with event type selection (e.g., "New Lead Captured", "Conversation Ended")

### Database
- `integrations` table storing widget customization settings and webhook URLs per agent

---

## Phase 6: CRM & Chat ao Vivo

### Chat List (Left Column)
- Scrollable list of all customer conversations
- Filter tabs: "IA Atendendo" / "Aguardando Humano" / "Todos"
- Search by contact name

### Chat Window (Right Panel)
- WhatsApp Web-style interface with message bubbles
- Contact info header (name, phone, email)
- Full message history between AI and customer
- "Assumir Controle" button to take over from AI

### Database
- `conversations` table (contact info, status, assigned agent)
- `messages` table (conversation_id, role, content, timestamp)

---

## Phase 7: Financeiro e Assinatura

### Current Plan Card
- Highlighted plan name (e.g., "Plano Pro"), renewal date, plan features summary

### Credits Usage
- Visual progress bar showing credits consumed vs available
- "Recarregar Agora" button opening a modal with credit package options

### Invoice History
- Table of past invoices with date, amount, status, and download button (all mock data)

---

## Design & UX
- Clean, modern SaaS aesthetic with the existing shadcn/ui component library
- Dark mode support
- Responsive layout optimized for desktop (primary) with mobile consideration
- Toast notifications for all actions (save, delete, connect, etc.)
- Loading skeletons for async data

