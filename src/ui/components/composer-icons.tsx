import {
  Bold,
  CircleDot,
  CodeXml,
  File,
  Hash,
  Heading,
  Highlighter,
  Image,
  Italic,
  Keyboard,
  KeyboardOff,
  List,
  ListOrdered,
  ListTodo,
  Mic,
  Quote,
  Radio,
  Redo2,
  Send,
  Strikethrough,
  Tag,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react-native';

export type ComposerIconName =
  | 'bold'
  | 'checklist'
  | 'codeBlock'
  | 'file'
  | 'hash'
  | 'heading'
  | 'highlight'
  | 'image'
  | 'italic'
  | 'keyboard'
  | 'keyboardHide'
  | 'mic'
  | 'orderedList'
  | 'quote'
  | 'recording'
  | 'redo'
  | 'send'
  | 'strikethrough'
  | 'tag'
  | 'undo'
  | 'unorderedList'
  | 'x';

interface ComposerIconProps {
  name: ComposerIconName;
  color?: string;
  size?: number;
}

const ICONS: Record<ComposerIconName, LucideIcon> = {
  bold: Bold,
  checklist: ListTodo,
  codeBlock: CodeXml,
  file: File,
  hash: Hash,
  heading: Heading,
  highlight: Highlighter,
  image: Image,
  italic: Italic,
  keyboard: Keyboard,
  keyboardHide: KeyboardOff,
  mic: Mic,
  orderedList: ListOrdered,
  quote: Quote,
  recording: Radio,
  redo: Redo2,
  send: Send,
  strikethrough: Strikethrough,
  tag: Tag,
  undo: Undo2,
  unorderedList: List,
  x: X,
};

export function ComposerIcon({
  name,
  color = '#0f172a',
  size = 24,
}: ComposerIconProps): React.ReactElement {
  const Icon = ICONS[name] ?? CircleDot;
  return (
    <Icon
      color={color}
      size={size}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.25}
    />
  );
}
