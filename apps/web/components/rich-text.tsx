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

export const RichText = ({ content }: RichTextProps) => {
  if (!content) {
    return <div />;
  }

  // Handle Lexical JSON format
  if (
    typeof content === "object" &&
    content != null &&
    "root" in content &&
    content.root?.children != null &&
    content.root?.children != undefined
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

  return <div />;
};

// Helper function to render child nodes
const renderChildren = (children: RichTextNode[] | undefined): React.ReactNode[] => {
  if (!children) return [];
  return children.map((child: RichTextNode, j: number) => <span key={j}>{child.text}</span>);
};

// Helper function to render list items
const renderListItems = (children: RichTextNode[] | undefined): React.ReactElement[] => {
  if (!children) return [];
  return children.map((listItem: RichTextNode, j: number) => (
    <li key={j}>
      {listItem.children
        ? listItem.children.map((child: RichTextNode, k: number) => <span key={k}>{child.text}</span>)
        : null}
    </li>
  ));
};

// Helper function to create heading elements
const createHeading = (level: 1 | 2 | 3 | 4 | 5 | 6, node: RichTextNode, key: number): React.ReactElement => {
  const HeadingTag = `h${level}` as keyof React.JSX.IntrinsicElements;
  return React.createElement(HeadingTag, { key }, renderChildren(node.children));
};

const renderNode = (node: RichTextNode, i: number): React.ReactElement | null => {
  // Handle headings
  if (node.type === "h1") return createHeading(1, node, i);
  if (node.type === "h2") return createHeading(2, node, i);
  if (node.type === "h3") return createHeading(3, node, i);
  if (node.type === "h4") return createHeading(4, node, i);
  if (node.type === "h5") return createHeading(5, node, i);
  if (node.type === "h6") return createHeading(6, node, i);

  // Handle text elements
  if (node.type === "paragraph") {
    return <p key={i}>{renderChildren(node.children)}</p>;
  }
  if (node.type === "quote") {
    return <blockquote key={i}>{renderChildren(node.children)}</blockquote>;
  }

  // Handle lists
  if (node.type === "ul") {
    return <ul key={i}>{renderListItems(node.children)}</ul>;
  }
  if (node.type === "ol") {
    return <ol key={i}>{renderListItems(node.children)}</ol>;
  }
  if (node.type === "li") {
    return <li key={i}>{renderChildren(node.children)}</li>;
  }

  // Handle links
  if (node.type === "link") {
    return (
      <a key={i} href={node.url}>
        {renderChildren(node.children)}
      </a>
    );
  }

  // Handle text nodes
  if (node.text != null && node.text !== "") {
    return <span key={i}>{node.text}</span>;
  }

  return null;
};
