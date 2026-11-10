import {useState, useEffect, useCallback} from 'react';
import socket from './socket';

const API_URL = 'http://localhost:3000';

export default function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [isDark, setIsDark] = useState(true);

  const [code, setCode] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [stdin, setStdin] = useState('');

  useEffect(() => {
    socket.connect();

    return () => {
      socket.disconnect();
    };
  }, []);

  const addToTerminalOutput = useCallback(
    (output: string, clear: boolean = false) => {
      setTerminalOutput(prev => (clear ? [output] : [...prev, output]));
    },
    [],
  );

  useEffect(() => {
    const onConnect = () => {
      setIsConnected(true);
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    const onTerminalOutput = (output: string) => {
      addToTerminalOutput(output);
    };

    const onJobStatus = (update: {status: string; jobId: string}) => {
      setStatus(update.status);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    socket.on('execution_output', onTerminalOutput);
    socket.on('job_status', onJobStatus);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);

      socket.off('execution_output', onTerminalOutput);
      socket.off('job_status', onJobStatus);
    };
  }, [addToTerminalOutput]);

  const submitCode = async () => {
    if (!code.trim()) {
      return;
    }

    addToTerminalOutput('Submitting job to cluster.');

    try {
      const response = await fetch(`${API_URL}/execution/submit`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({code, language: 'typescript'}),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setTerminalOutput([]);

      const {data} = await response.json();

      setStatus(data.status);
      setJobId(data.jobId);
      socket.emit('subscribe', data.jobId);

      addToTerminalOutput(`Job Assigned: ${data.jobId}. Awaiting worker.`);
    } catch (error: unknown) {
      addToTerminalOutput(
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  };

  const sendStdin = () => {
    if (!socket || !jobId || !stdin) {
      return;
    }

    socket.emit('terminal_input', {jobId, data: `${stdin}\n`});

    addToTerminalOutput(stdin);
    setStdin('');
  };

  const cancelJob = async () => {
    if (!jobId) {
      return;
    }

    try {
      await fetch(`${API_URL}/execution/${jobId}`, {method: 'DELETE'});

      addToTerminalOutput(`Job ${jobId} cancellation requested.`, true);
    } catch (error) {
      console.error('Failed to cancel job', error);
    }
  };

  const bg = isDark ? 'black' : 'white';
  const fg = isDark ? 'white' : 'black';

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        backgroundColor: bg,
        color: fg,
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '20px',
          borderRight: `1px solid ${fg}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px',
          }}
        >
          <h2 style={{margin: 0}}>editor.ts</h2>
          <span>
            {isConnected ? 'Socket Connected' : 'Socket Disconnected'}
          </span>
        </div>

        <textarea
          value={code}
          onChange={e => setCode(e.target.value)}
          spellCheck={false}
          style={{
            flex: 1,
            backgroundColor: bg,
            color: fg,
            padding: '15px',
            fontFamily: 'monospace',
            fontSize: '14px',
            border: `1px solid ${fg}`,
            outline: 'none',
            resize: 'none',
          }}
        />

        <div style={{display: 'flex', gap: '10px', marginTop: '15px'}}>
          <button
            onClick={submitCode}
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: fg,
              color: bg,
              border: `1px solid ${fg}`,
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Run Code
          </button>
          <button
            onClick={cancelJob}
            disabled={!jobId}
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: bg,
              color: fg,
              border: `1px solid ${fg}`,
              cursor: jobId ? 'pointer' : 'not-allowed',
              opacity: jobId ? 1 : 0.5,
            }}
          >
            Cancel Job
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px',
          }}
        >
          <h2 style={{margin: 0}}>Terminal</h2>

          <div style={{display: 'flex', gap: '15px', alignItems: 'center'}}>
            <span style={{fontSize: '14px'}}>Status: {status}</span>
            <button
              onClick={() => setIsDark(!isDark)}
              style={{
                backgroundColor: bg,
                color: fg,
                border: `1px solid ${fg}`,
                cursor: 'pointer',
                padding: '4px 8px',
                fontFamily: 'inherit',
                fontWeight: 'bold',
              }}
            >
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            backgroundColor: bg,
            color: fg,
            padding: '15px',
            fontFamily: 'monospace',
            overflowY: 'auto',
            margin: 0,
            whiteSpace: 'pre-wrap',
            border: `1px solid ${fg}`,
          }}
        >
          {terminalOutput.map(line => line.replace(/\n$/, '')).join('\n')}{' '}
        </div>

        <div style={{display: 'flex', gap: '10px', marginTop: '15px'}}>
          <input
            type="text"
            value={stdin}
            onChange={e => setStdin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendStdin()}
            placeholder="Type stdin input here"
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: bg,
              color: fg,
              border: `1px solid ${fg}`,
              fontFamily: 'monospace',
              outline: 'none',
            }}
          />
          <button
            onClick={sendStdin}
            style={{
              padding: '10px 20px',
              backgroundColor: fg,
              color: bg,
              border: `1px solid ${fg}`,
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
