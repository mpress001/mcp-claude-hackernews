import axios from 'axios';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const baseUrl = 'https://hacker-news.firebaseio.com/v0';

interface Story {
  id: number;
  title: string;
  by: string;
  time: number;
  url?: string;
  score: number;
  kids?: number[];
  text?: string;
  type: string;
}

interface Comment {
  id: number;
  by: string;
  time: number;
  text: string;
  kids?: number[];
}

interface FormattedStory {
  id: number;
  title: string;
  by: string;
  time: string;
  url?: string;
  score: number;
  commentsCount: number;
  text?: string;
}

interface FormattedComment {
  id: number;
  by: string;
  time: string;
  text: string;
  replies: number;
}

class HackerNewsAPI {
  async getLatestStories(limit = 50): Promise<Story[]> {
    try {
      const response = await axios.get(`${baseUrl}/newstories.json`);
      const storyIds = response.data || [];
      const storyPromises = storyIds.slice(0, limit).map((id: number) => this.getItemDetails(id));
      const stories = await Promise.all(storyPromises);
      return stories.filter((story): story is Story => story !== null && story.type === 'story');
    } catch (error) {
      console.error('Error fetching latest stories:', error);
      return [];
    }
  }

  async getTopStories(limit = 50): Promise<Story[]> {
    try {
      const response = await axios.get(`${baseUrl}/topstories.json`);
      const storyIds = response.data || [];
      const storyPromises = storyIds.slice(0, limit).map((id: number) => this.getItemDetails(id));
      const stories = await Promise.all(storyPromises);
      return stories.filter((story): story is Story => story !== null && story.type === 'story');
    } catch (error) {
      console.error('Error fetching top stories:', error);
      return [];
    }
  }

  async getBestStories(limit = 50): Promise<Story[]> {
    try {
      const response = await axios.get(`${baseUrl}/beststories.json`);
      const storyIds = response.data || [];
      const storyPromises = storyIds.slice(0, limit).map((id: number) => this.getItemDetails(id));
      const stories = await Promise.all(storyPromises);
      return stories.filter((story): story is Story => story !== null && story.type === 'story');
    } catch (error) {
      console.error('Error fetching best stories:', error);
      return [];
    }
  }

  async getItemDetails(itemId: number): Promise<Story | Comment | null> {
    try {
      const response = await axios.get(`${baseUrl}/item/${itemId}.json`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching item ${itemId}:`, error);
      return null;
    }
  }

  async getComments(commentIds: number[] = []): Promise<Comment[]> {
    if (!commentIds || commentIds.length === 0) {
      return [];
    }
    try {
      const commentPromises = commentIds.map(id => this.getItemDetails(id));
      const comments = await Promise.all(commentPromises);
      return comments.filter((comment): comment is Comment => comment !== null);
    } catch (error) {
      console.error('Failed to load comments:', error);
      return [];
    }
  }

  formatTime(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  }

  cleanText(text: string | undefined): string {
    if (!text) return '';
    return text
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/<[^>]*>?/gm, '');
  }
}

const api = new HackerNewsAPI();

let lastStoriesList: FormattedStory[] = [];

const server = new Server(
  {
    name: "mcp-claude-hackernews",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "hn",
        description: "Interfaz principal para Hacker News con comandos simplificados",
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "Comando a ejecutar (latest, top, best, history, comments)"
            },
            param: {
              type: "string",
              description: "Parámetro opcional, número precedido por -- (ejemplo: --10, --50)"
            }
          },
          required: ["command"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  
try {
  if (name === "hn") {
    const command = (typeof args?.command === 'string' ? args.command : '').toLowerCase() || '';
    const param = args?.param || '';
      
      let numParam = 10;
      if (param && typeof param === 'string' && param.indexOf('--') === 0) {
        const paramValue = parseInt(param.slice(2), 10);
        if (!isNaN(paramValue) && paramValue > 0) {
          numParam = Math.min(paramValue, 50);
        }
      }
      
      switch (command) {
        case 'latest':
          return await handleLatestStories(numParam);
        
        case 'top':
          return await handleTopStories(numParam);
        
        case 'best':
          return await handleBestStories(numParam);
        
        case 'history':
          if (param && typeof param === 'string' && param.indexOf('--') === 0) {
            const storyId = param.slice(2);
            return await handleGetStory(storyId);
          } else {
            throw new Error('Se requiere un ID de historia (formato: hn history --12345678)');
          }
        
        case 'comments':
          if (param && typeof param === 'string' && param.indexOf('--') === 0) {
            const storyIndex = parseInt(param.slice(2), 10);
            if (!isNaN(storyIndex) && storyIndex > 0 && storyIndex <= lastStoriesList.length) {
              const story = lastStoriesList[storyIndex - 1];
              return await handleGetComments(story.id);
            } else if (!isNaN(parseInt(param.slice(2), 10))) {
              return await handleGetComments(parseInt(param.slice(2), 10));
            }
          }
          throw new Error('Se requiere un índice válido o ID de historia (formato: hn comments --3 o hn comments --12345678)');
        
        default:
          throw new Error(`Comando desconocido: ${command}. Comandos disponibles: latest, top, best, history, comments`);
      }
    }
    
    throw new Error(`Herramienta desconocida: ${name}`);
  } catch (error) {
    console.error(`Error al manejar la solicitud:`, error);
    throw error;
  }
});

async function handleLatestStories(count: number) {
  const stories = await api.getLatestStories(count);
  
  const formattedStories = stories.map(story => ({
    id: story.id,
    title: story.title,
    by: story.by,
    time: api.formatTime(story.time),
    url: story.url,
    score: story.score,
    commentsCount: story.kids?.length || 0
  }));
  
  lastStoriesList = formattedStories;
  
  return {
    content: [
      {
        type: "text",
        text: formatStoriesAsText(formattedStories)
      }
    ]
  };
}

async function handleTopStories(count: number) {
  const stories = await api.getTopStories(count);
  
  const formattedStories = stories.map(story => ({
    id: story.id,
    title: story.title,
    by: story.by,
    time: api.formatTime(story.time),
    url: story.url,
    score: story.score,
    commentsCount: story.kids?.length || 0
  }));
  
  lastStoriesList = formattedStories;
  
  return {
    content: [
      {
        type: "text",
        text: formatStoriesAsText(formattedStories)
      }
    ]
  };
}

async function handleBestStories(count: number) {
  const stories = await api.getBestStories(count);
  
  const formattedStories = stories.map(story => ({
    id: story.id,
    title: story.title,
    by: story.by,
    time: api.formatTime(story.time),
    url: story.url,
    score: story.score,
    commentsCount: story.kids?.length || 0
  }));
  
  lastStoriesList = formattedStories;
  
  return {
    content: [
      {
        type: "text",
        text: formatStoriesAsText(formattedStories)
      }
    ]
  };
}

async function handleGetStory(storyId: string) {
  const numericId = parseInt(storyId, 10);
  if (isNaN(numericId)) {
    throw new Error('El ID de historia debe ser un número');
  }
  
  const story = await api.getItemDetails(numericId) as Story | null;
  if (!story) {
    throw new Error(`No se encontró la historia con ID ${numericId}`);
  }
  
  const formattedStory = {
    id: story.id,
    title: story.title,
    by: story.by,
    time: api.formatTime(story.time),
    url: story.url,
    text: story.text ? api.cleanText(story.text) : '',
    score: story.score,
    commentsCount: story.kids?.length || 0
  };
  
  return {
    content: [
      {
        type: "text",
        text: formatStoryAsText(formattedStory)
      }
    ]
  };
}

async function handleGetComments(storyId: number) {
  if (isNaN(storyId)) {
    throw new Error('El ID de historia debe ser un número');
  }
  
  const story = await api.getItemDetails(storyId) as Story | null;
  if (!story) {
    throw new Error(`No se encontró la historia con ID ${storyId}`);
  }
  
  if (!story.kids || story.kids.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No se encontraron comentarios para la historia "${story.title}" (ID: ${story.id})`
        }
      ]
    };
  }
  
  const comments = await api.getComments(story.kids);
  
  const formattedComments = comments.map(comment => ({
    id: comment.id,
    by: comment.by,
    time: api.formatTime(comment.time),
    text: api.cleanText(comment.text),
    replies: comment.kids ? comment.kids.length : 0
  }));
  
  return {
    content: [
      {
        type: "text",
        text: formatCommentsAsText(story.title, formattedComments)
      }
    ]
  };
}

function formatStoriesAsText(stories: FormattedStory[]): string {
  if (!stories || stories.length === 0) {
    return "No se encontraron historias.";
  }
  
  return stories.map((story, index) => {
    return `${index + 1}. ${story.title}
   ID: ${story.id}
   Por: ${story.by}
   Publicado: ${story.time}
   Puntos: ${story.score}
   Comentarios: ${story.commentsCount}
   URL: ${story.url || 'N/A'}
   ------------------------------`;
  }).join('\n\n');
}

function formatStoryAsText(story: FormattedStory): string {
  if (!story) {
    return "No se encontró la historia.";
  }
  
  let result = `Título: ${story.title}
ID: ${story.id}
Por: ${story.by}
Publicado: ${story.time}
Puntos: ${story.score}
Comentarios: ${story.commentsCount}
URL: ${story.url || 'N/A'}`;

  if (story.text) {
    result += `\n\nContenido:\n${story.text}`;
  }
  
  return result;
}

function formatCommentsAsText(storyTitle: string, comments: FormattedComment[]): string {
  if (!comments || comments.length === 0) {
    return "No se encontraron comentarios.";
  }
  
  const header = `Comentarios para "${storyTitle}" (Total: ${comments.length}):\n`;
  
  const formattedComments = comments.map((comment, index) => {
    return `${index + 1}. Comentario de ${comment.by} a las ${comment.time}:
   "${comment.text}"
   ${comment.replies > 0 ? `(${comment.replies} respuestas)` : '(sin respuestas)'}
   ------------------------------`;
  }).join('\n\n');
  
  return header + '\n' + formattedComments;
}

async function main() {
  const transport = new StdioServerTransport();
  
  try {
    await server.connect(transport);
    console.error("Servidor MCP de Hacker News ejecutándose en stdio");
  } catch (error) {
    console.error("Error al conectar con el transporte:", error);
    throw error;
  }
}

main().catch((error) => {
  console.error("Error fatal en main():", error);
  process.exit(1);
});