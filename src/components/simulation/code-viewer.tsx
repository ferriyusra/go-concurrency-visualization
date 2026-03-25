'use client';

import { useState, useRef, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

type CodeViewerProps = {
	code: string;
	title?: string;
	highlightedLines?: [number, number];
};

export function CodeViewer({ code, title, highlightedLines }: CodeViewerProps) {
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (highlightedLines && scrollContainerRef.current) {
			const lineHeight = 19.2;
			const targetScroll = (highlightedLines[0] - 1) * lineHeight - 60;
			scrollContainerRef.current.scrollTo({
				top: Math.max(0, targetScroll),
				behavior: 'smooth',
			});
		}
	}, [highlightedLines]);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(code);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="relative rounded-lg border bg-[#282c34] overflow-hidden">
			{title && (
				<div className="flex items-center justify-between border-b border-gray-700 px-4 py-2">
					<span className="text-sm font-medium text-gray-300">{title}</span>
					<Button
						variant="ghost"
						size="sm"
						onClick={handleCopy}
						className="h-7 text-gray-400 hover:text-white"
					>
						{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
					</Button>
				</div>
			)}
			<div ref={scrollContainerRef} className="max-h-150 overflow-auto">
				<SyntaxHighlighter
					language="go"
					style={oneDark}
					customStyle={{
						margin: 0,
						padding: '1rem',
						fontSize: '0.8rem',
						lineHeight: '1.5',
						background: 'transparent',
					}}
					showLineNumbers
					wrapLines
					lineNumberStyle={{ color: '#636d83', fontSize: '0.75rem' }}
					lineProps={(lineNumber: number) => {
						const isHighlighted =
							highlightedLines &&
							lineNumber >= highlightedLines[0] &&
							lineNumber <= highlightedLines[1];
						return {
							style: {
								backgroundColor: isHighlighted
									? 'rgba(59, 130, 246, 0.15)'
									: undefined,
								borderLeft: isHighlighted
									? '3px solid #3b82f6'
									: '3px solid transparent',
								display: 'block',
								transition: 'background-color 0.3s ease',
							},
						};
					}}
				>
					{code}
				</SyntaxHighlighter>
			</div>
		</div>
	);
}
