"use client";
import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';
import Image from 'next/image';
import { Box, Flex, Grid, Text, TextArea, Button, Card, ScrollArea } from '@radix-ui/themes';
import { Theme } from '@radix-ui/themes';

export default function ControlPanel() {
  interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
  }

  const [imgSrc, setImgSrc] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [scriptInput, setScriptInput] = useState('');
  const [userMessage, setUserMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    setMessages([{
      role: 'system',
      content: 'You are a helpful assistant that generates Puppeteer scripts.'
    }]);
  }, []);

  useEffect(() => {
    const socket = io('http://localhost:4000');
    socket.on('connect', () => console.log('WS connected'));
    socket.on('screenshot', (data: string) => {
      setImgSrc(`data:image/png;base64,${data}`);
    });
    socket.on('disconnect', () => console.log('WS disconnected'));
    return () => { socket.disconnect(); };
  }, []);

  const sendMessageToAI = async () => {
    if (!userMessage.trim()) return;
    setIsGenerating(true);

    // Add the user message
    const newMessages: ChatMessage[] = [
      ...messages,
      { role: 'user', content: userMessage.trim() },
    ];
    setMessages(newMessages);
    setUserMessage('');

    try {
      // Set up EventSource for SSE with the messages as query params
      const queryParams = new URLSearchParams({
        messages: JSON.stringify(newMessages)
      });
      const eventSource = new EventSource(`/api/ai?${queryParams.toString()}`);
      let currentAssistantMessage = '';

      // Handle incoming events
      eventSource.onmessage = (event) => {
        console.log('Received SSE message:', event);
      };

      eventSource.addEventListener('token', (event) => {
        console.log('Received token:', event.data);
        currentAssistantMessage += event.data;
        setMessages(prev => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (lastIndex >= 0 && updated[lastIndex].role === 'assistant') {
            updated[lastIndex].content = currentAssistantMessage;
          } else {
            updated.push({
              role: 'assistant',
              content: currentAssistantMessage
            });
          }
          return updated;
        });
      });

      eventSource.addEventListener('tool_use', (event) => {
        console.log('Tool use requested:', event.data);
        setLog(prev => [...prev, `Tool Use Requested: ${event.data}`]);
      });

      eventSource.addEventListener('tool_result', (event) => {
        console.log('Tool result:', event.data);
        setLog(prev => [...prev, `Tool Result: ${event.data}`]);
      });

      // Handle errors
      eventSource.onerror = () => {
        // Only log and cleanup if we haven't received a done event
        if (eventSource.readyState !== EventSource.CLOSED) {
          console.error('SSE connection error');
          eventSource.close();
          setIsGenerating(false);
        }
      };

      // Wait for the response to complete
      await new Promise((resolve) => {
        eventSource.addEventListener('done', () => {
          console.log('Received done event, closing connection');
          eventSource.close();
          setIsGenerating(false);
          resolve(null);
        });
      });
    } catch (error) {
      console.error('Error in AI processing:', error);
      setLog(prev => [...prev, `Error: ${error instanceof Error ? error.message : String(error)}`]);
    } finally {
      setIsGenerating(false);
    }
  };

  const runScript = async (code: string) => {
    const res = await fetch('/server/api/script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    setLog(prev => [...prev, JSON.stringify(data)]);
  };

  return (
    <Theme appearance="dark" accentColor="purple" grayColor="slate">
      <Box p="8" style={{ minHeight: '100vh', backgroundColor: 'var(--color-background)' }}>
        <Flex direction="column" gap="8" style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <Text size="8" weight="bold">AI Automation Control Panel</Text>
          
          <Grid columns={{ initial: '1', lg: '4' }} gap="8">
            {/* Sidebar */}
            <Flex direction="column" gap="4" style={{ gridColumn: 'span 1' }}>
              <Card>
                <Flex direction="column" gap="4">
                  <Text size="5" weight="bold">Chat with AI</Text>
                  <ScrollArea style={{ maxHeight: '300px', backgroundColor: 'var(--color-panel)' }}>
                    <Flex direction="column" gap="2" p="2">
                      {messages.map((msg, idx) => (
                        <Box key={idx}>
                          <Text color={msg.role === 'user' ? 'blue' : msg.role === 'assistant' ? 'green' : 'gray'}>
                            <strong>
                              {msg.role === 'user'
                                ? 'User'
                                : msg.role === 'assistant'
                                ? 'AI'
                                : 'System'}
                              :
                            </strong>
                          </Text>
                          <Text size="2" style={{ whiteSpace: 'pre-wrap' }}>
                            {msg.content}
                          </Text>
                        </Box>
                      ))}
                    </Flex>
                  </ScrollArea>

                  <TextArea
                    value={userMessage}
                    onChange={(e) => setUserMessage(e.target.value)}
                    rows={3}
                    placeholder="Type your message here..."
                    style={{ backgroundColor: 'var(--color-panel)' }}
                  />
                  <Button 
                    onClick={sendMessageToAI} 
                    disabled={isGenerating}
                    style={{ width: '100%' }}
                  >
                    {isGenerating ? 'Thinking...' : 'Send'}
                  </Button>

                  <Flex direction="column" gap="3">
                    <Text as="label" size="2" weight="medium">Script Input</Text>
                    <TextArea
                      value={scriptInput}
                      onChange={(e) => setScriptInput(e.target.value)}
                      rows={4}
                      placeholder="Enter JavaScript code"
                      style={{ backgroundColor: 'var(--color-panel)' }}
                    />
                  </Flex>
                  
                  <Button 
                    onClick={() => runScript(scriptInput)}
                    style={{ width: '100%' }}
                  >
                    Execute Script
                  </Button>
                </Flex>
              </Card>
            </Flex>

            {/* Main Content */}
            <Flex direction="column" gap="8" style={{ gridColumn: 'span 3' }}>
              {/* Live Feed */}
              <Card>
                <Flex direction="column" gap="4">
                  <Text size="5" weight="bold">Live Browser Feed</Text>
                  <Box style={{ position: 'relative', aspectRatio: '16/9', backgroundColor: 'var(--color-panel)' }}>
                    {imgSrc ? (
                      <Image
                        src={imgSrc}
                        alt="Live Feed"
                        fill
                        style={{ objectFit: 'contain' }}
                      />
                    ) : (
                      <Flex align="center" justify="center" style={{ position: 'absolute', inset: 0 }}>
                        <Text color="gray">Connecting to feed...</Text>
                      </Flex>
                    )}
                  </Box>
                </Flex>
              </Card>

              {/* Logs */}
              <Card>
                <Flex direction="column" gap="4">
                  <Text size="5" weight="bold">Activity Log</Text>
                  <ScrollArea style={{ maxHeight: '400px' }}>
                    <Flex direction="column" gap="2">
                      {log.map((entry, i) => (
                        <Box key={i} p="2" style={{ backgroundColor: 'var(--color-panel)' }}>
                          <Text size="2">{entry}</Text>
                        </Box>
                      ))}
                    </Flex>
                  </ScrollArea>
                </Flex>
              </Card>
            </Flex>
          </Grid>
        </Flex>
      </Box>
    </Theme>
  );
}
