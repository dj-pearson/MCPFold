import { Link, useParams } from 'react-router-dom';
import { Container } from '../design/components';
import { postBySlug } from './posts';
import './prose.css';

/** A single blog post (S13.7) — renders the authored markdown with its own OG tags. */
export function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const post = postBySlug(slug);

  if (!post) {
    return (
      <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
        <h1>Not found</h1>
        <p>
          No post “{slug}”. <Link to="/blog">Back to the blog</Link>.
        </p>
      </Container>
    );
  }

  return (
    <>
      <Container style={{ padding: 'var(--space-16) var(--space-6)', maxWidth: 720 }}>
        <p style={{ marginBottom: 'var(--space-4)' }}>
          <Link to="/blog">← Blog</Link>
        </p>
        <h1 style={{ marginBottom: 'var(--space-2)' }}>{post.title}</h1>
        <div style={{ color: 'var(--fg-muted)', marginBottom: 'var(--space-8)' }}>{post.date}</div>
        <article
          className="prose"
          data-testid="post-body"
          dangerouslySetInnerHTML={{ __html: post.html }}
        />
      </Container>
    </>
  );
}
