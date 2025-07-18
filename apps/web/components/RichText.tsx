import React from "react";

interface RichTextProps {
  content: any;
}

export const RichText: React.FC<RichTextProps> = ({ content }) => {
  if (!content) {
    return null;
  }

  // Handle Lexical JSON format
  if (content.root && content.root.children) {
    return (
      <div className="prose dark:prose-invert">
        {content.root.children.map((node: any, i: number) => {
          return renderNode(node, i);
        })}
      </div>
    );
  }

  // Handle array format (legacy)
  return (
    <div className="prose dark:prose-invert">
      {content.map((node: any, i: number) => {
        return renderNode(node, i);
      })}
    </div>
  );
};

function renderNode(node: any, i: number): React.ReactNode {
  if (node.type === "h1") {
    return (
      <h1 key={i}>
        {node.children.map((child: any, j: number) => (
          <span key={j}>{child.text}</span>
        ))}
      </h1>
    );
  }
  if (node.type === "h2") {
    return (
      <h2 key={i}>
        {node.children.map((child: any, j: number) => (
          <span key={j}>{child.text}</span>
        ))}
      </h2>
    );
  }
  if (node.type === "h3") {
    return (
      <h3 key={i}>
        {node.children.map((child: any, j: number) => (
          <span key={j}>{child.text}</span>
        ))}
      </h3>
    );
  }
  if (node.type === "h4") {
    return (
      <h4 key={i}>
        {node.children.map((child: any, j: number) => (
          <span key={j}>{child.text}</span>
        ))}
      </h4>
    );
  }
  if (node.type === "h5") {
    return (
      <h5 key={i}>
        {node.children.map((child: any, j: number) => (
          <span key={j}>{child.text}</span>
        ))}
      </h5>
    );
  }
  if (node.type === "h6") {
    return (
      <h6 key={i}>
        {node.children.map((child: any, j: number) => (
          <span key={j}>{child.text}</span>
        ))}
      </h6>
    );
  }
  if (node.type === "paragraph") {
    return (
      <p key={i}>
        {node.children.map((child: any, j: number) => (
          <span key={j}>{child.text}</span>
        ))}
      </p>
    );
  }
  if (node.type === "quote") {
    return (
      <blockquote key={i}>
        {node.children.map((child: any, j: number) => (
          <span key={j}>{child.text}</span>
        ))}
      </blockquote>
    );
  }
  if (node.type === "ul") {
    return (
      <ul key={i}>
        {node.children.map((listItem: any, j: number) => (
          <li key={j}>
            {listItem.children.map((child: any, k: number) => (
              <span key={k}>{child.text}</span>
            ))}
          </li>
        ))}
      </ul>
    );
  }
  if (node.type === "ol") {
    return (
      <ol key={i}>
        {node.children.map((listItem: any, j: number) => (
          <li key={j}>
            {listItem.children.map((child: any, k: number) => (
              <span key={k}>{child.text}</span>
            ))}
          </li>
        ))}
      </ol>
    );
  }
  if (node.type === "li") {
    return (
      <li key={i}>
        {node.children.map((child: any, j: number) => (
          <span key={j}>{child.text}</span>
        ))}
      </li>
    );
  }
  if (node.type === "link") {
    return (
      <a key={i} href={node.url}>
        {node.children.map((child: any, j: number) => (
          <span key={j}>{child.text}</span>
        ))}
      </a>
    );
  }

  // Handle text nodes
  if (node.text) {
    return <span key={i}>{node.text}</span>;
  }

  return null;
}
