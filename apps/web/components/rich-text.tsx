import React from "react";

interface RichTextNode {
  type: string;
  children?: RichTextNode[];
  text?: string;
  url?: string;
  [key: string]: unknown;
}

interface RootContent {
  root: {
    children: RichTextNode[];
  };
}

interface RichTextProps {
  content: RootContent | RichTextNode[] | null | undefined;
}

export const RichText: React.FC<RichTextProps> = ({ content }) => {
  if (!content) {
    return null;
  }

  // Handle Lexical JSON format
  if (
    typeof content === "object" &&
    content !== null &&
    "root" in content &&
    content.root?.children !== null &&
    content.root?.children !== undefined
  ) {
    return (
      <div className="prose prose-lg dark:prose-invert mx-auto max-w-none">
        {content.root.children.map((node: RichTextNode, i: number) => {
          return renderNode(node, i);
        })}
      </div>
    );
  }

  // Handle array format (legacy)
  if (Array.isArray(content)) {
    return (
      <div className="prose prose-lg dark:prose-invert mx-auto max-w-none">
        {content.map((node: RichTextNode, i: number) => {
          return renderNode(node, i);
        })}
      </div>
    );
  }

  return null;
};

function renderNode(node: RichTextNode, i: number): React.ReactNode {
  if (node.type === "h1") {
    return (
      <h1 key={i}>
        {node.children?.map((child: RichTextNode, j: number) => (
          <span key={j}>{child.text}</span>
        ))}
      </h1>
    );
  }
  if (node.type === "h2") {
    return (
      <h2 key={i}>
        {node.children?.map((child: RichTextNode, j: number) => (
          <span key={j}>{child.text}</span>
        ))}
      </h2>
    );
  }
  if (node.type === "h3") {
    return (
      <h3 key={i}>
        {node.children?.map((child: RichTextNode, j: number) => (
          <span key={j}>{child.text}</span>
        ))}
      </h3>
    );
  }
  if (node.type === "h4") {
    return (
      <h4 key={i}>
        {node.children?.map((child: RichTextNode, j: number) => (
          <span key={j}>{child.text}</span>
        ))}
      </h4>
    );
  }
  if (node.type === "h5") {
    return (
      <h5 key={i}>
        {node.children?.map((child: RichTextNode, j: number) => (
          <span key={j}>{child.text}</span>
        ))}
      </h5>
    );
  }
  if (node.type === "h6") {
    return (
      <h6 key={i}>
        {node.children?.map((child: RichTextNode, j: number) => (
          <span key={j}>{child.text}</span>
        ))}
      </h6>
    );
  }
  if (node.type === "paragraph") {
    return (
      <p key={i}>
        {node.children?.map((child: RichTextNode, j: number) => (
          <span key={j}>{child.text}</span>
        ))}
      </p>
    );
  }
  if (node.type === "quote") {
    return (
      <blockquote key={i}>
        {node.children?.map((child: RichTextNode, j: number) => (
          <span key={j}>{child.text}</span>
        ))}
      </blockquote>
    );
  }
  if (node.type === "ul") {
    return (
      <ul key={i}>
        {node.children?.map((listItem: RichTextNode, j: number) => (
          <li key={j}>
            {listItem.children?.map((child: RichTextNode, k: number) => (
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
        {node.children?.map((listItem: RichTextNode, j: number) => (
          <li key={j}>
            {listItem.children?.map((child: RichTextNode, k: number) => (
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
        {node.children?.map((child: RichTextNode, j: number) => (
          <span key={j}>{child.text}</span>
        ))}
      </li>
    );
  }
  if (node.type === "link") {
    return (
      <a key={i} href={node.url}>
        {node.children?.map((child: RichTextNode, j: number) => (
          <span key={j}>{child.text}</span>
        ))}
      </a>
    );
  }

  // Handle text nodes
  if (node.text !== null && node.text !== undefined && node.text !== "") {
    return <span key={i}>{node.text}</span>;
  }

  return null;
}
