import { Link } from 'react-router-dom';
import { Container } from '../design/components';
import { Seo } from '../seo/Seo';
import { POSTS } from './posts';

/** Blog index (S13.7) — lists markdown-authored posts, newest first. */
export function BlogIndex() {
  return (
    <>
      <Seo
        title="Blog — mcpfold"
        description="Launches, deep-dives, and release notes from the mcpfold project."
        path="/blog"
      />
      <Container style={{ padding: 'var(--space-16) var(--space-6)', maxWidth: 760 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h1>Blog</h1>
          <a href="/feed.xml" aria-label="RSS feed">
            RSS
          </a>
        </div>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {POSTS.map((post) => (
            <li
              key={post.slug}
              data-testid={`post-${post.slug}`}
              style={{ margin: 'var(--space-8) 0' }}
            >
              <Link to={`/blog/${post.slug}`} style={{ fontSize: '1.3rem', fontWeight: 700 }}>
                {post.title}
              </Link>
              <div
                style={{
                  color: 'var(--fg-muted)',
                  fontSize: '0.85rem',
                  margin: 'var(--space-2) 0',
                }}
              >
                {post.date}
              </div>
              <p style={{ color: 'var(--fg-muted)', margin: 0 }}>{post.description}</p>
            </li>
          ))}
        </ul>
      </Container>
    </>
  );
}
