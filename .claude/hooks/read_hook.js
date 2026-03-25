async function main() {
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(chunk);
    }
    const toolArgs = JSON.parse(Buffer.concat(chunks).toString());

    // readPath is the path to the file that Claude is trying to read
    const readPath = toolArgs.tool_input?.file_path || toolArgs.tool_input?.path || "";

    const normalizedPath = readPath.replace(/\\/g, '/');
    const fileName = normalizedPath.split('/').pop() || "";

    // Block .env files (e.g. .env, .env.local, .env.production)
    if (fileName.startsWith(".env")) {
        console.error("You cannot read .env files");
        process.exit(2);
    }

}

main();