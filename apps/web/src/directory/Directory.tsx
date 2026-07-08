import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type DirectoryEntry, searchDirectory } from './seed';
import { emptyDraft, type ServerDraft } from '../editor/validation';

function toDraft(entry: DirectoryEntry): ServerDraft {
  return {
    ...emptyDraft,
    name: entry.id,
    transport: entry.transport,
    command: entry.command ?? '',
    args: (entry.args ?? []).join(' '),
    url: entry.url ?? '',
    token: entry.tokenRef ?? '',
    tags: entry.suggestedTags.join(', '),
  };
}

export function Directory() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const results = searchDirectory(query);

  return (
    <div className="page">
      <div className="editor-head">
        <h2>Server directory</h2>
      </div>
      <p className="muted">
        A community-maintained list of MCP servers. mcpfold is not affiliated with or endorsed by
        these projects or the MCP project.
      </p>
      <input
        aria-label="Search"
        placeholder="Search servers…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <ul className="server-list">
        {results.map((entry) => (
          <li key={entry.id} className="card" data-testid={`dir-${entry.id}`}>
            <div>
              <strong>{entry.name}</strong> <span className="muted">{entry.transport}</span>
            </div>
            <p className="muted">{entry.description}</p>
            <ul className="chips">
              {entry.suggestedTags.map((t) => (
                <li key={t} className="chip">
                  {t}
                </li>
              ))}
            </ul>
            <button
              data-testid={`add-${entry.id}`}
              onClick={() => navigate('/editor', { state: { prefill: toDraft(entry) } })}
            >
              Add to config
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="muted">No matches.</li>}
      </ul>
    </div>
  );
}
