/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import mqtt from 'mqtt';
import { PieceColor, GameState, GameMode } from '../types';

export type ConnectionStatus = 
  | 'idle'
  | 'connecting_mqtt'
  | 'lobby'
  | 'connecting_webrtc'
  | 'connected'
  | 'disconnected';

export interface MultiplayerState {
  isMultiplayerActive: boolean;
  isHost: boolean;
  roomId: string;
  playerId: string;
  playerName: string;
  opponentId: string;
  opponentName: string;
  opponentOnline: boolean;
  connectionStatus: ConnectionStatus;
  myColor: PieceColor | null;
}

const MQTT_BROKER = 'wss://broker.emqx.io:8084/mqtt';
const STUN_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export function useChessMultiplayer(
  gameState: GameState,
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>,
  initGame: (newMode: GameMode) => void
) {
  const [playerId] = useState(() => {
    let id = localStorage.getItem('chess_p2p_player_id');
    if (!id) {
      id = Math.random().toString(36).substring(2, 9);
      localStorage.setItem('chess_p2p_player_id', id);
    }
    return id;
  });

  const [playerName, setPlayerNameState] = useState(() => {
    return localStorage.getItem('chess_p2p_player_name') || `棋士_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  });

  const [mpState, setMpState] = useState<MultiplayerState>({
    isMultiplayerActive: false,
    isHost: false,
    roomId: '',
    playerId,
    playerName,
    opponentId: '',
    opponentName: '',
    opponentOnline: false,
    connectionStatus: 'idle',
    myColor: null
  });

  const mpStateRef = useRef(mpState);
  useEffect(() => {
    mpStateRef.current = mpState;
  }, [mpState]);

  const mqttClientRef = useRef<mqtt.MqttClient | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const gameStateRef = useRef<GameState>(gameState);
  
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const setPlayerName = useCallback((name: string) => {
    localStorage.setItem('chess_p2p_player_name', name);
    setPlayerNameState(name);
    setMpState(prev => ({ ...prev, playerName: name }));
  }, []);

  // Gracefully close connections
  const disconnectAll = useCallback(() => {
    console.log('Disconnecting all P2P connections...');
    if (dataChannelRef.current) {
      try { dataChannelRef.current.close(); } catch (e) {}
      dataChannelRef.current = null;
    }
    if (peerConnectionRef.current) {
      try { peerConnectionRef.current.close(); } catch (e) {}
      peerConnectionRef.current = null;
    }
    if (mqttClientRef.current) {
      try { mqttClientRef.current.end(); } catch (e) {}
      mqttClientRef.current = null;
    }

    setMpState(prev => ({
      ...prev,
      isMultiplayerActive: false,
      connectionStatus: 'idle',
      opponentId: '',
      opponentName: '',
      opponentOnline: false,
      myColor: null
    }));
  }, []);

  // Broadcast game state to Guest (only if Host)
  const broadcastGameState = useCallback((state: GameState, myColorOverride?: PieceColor | null) => {
    if (!mpStateRef.current.isHost || !dataChannelRef.current || dataChannelRef.current.readyState !== 'open') return;

    // Send update
    const payload = {
      type: 'ROOM_UPDATE',
      gameState: state,
      // If we are Host, our color is mpState.myColor (or the override), Guest gets the opposite
      hostColor: myColorOverride !== undefined ? myColorOverride : mpStateRef.current.myColor
    };

    console.log('Host broadcasting game state update...');
    try {
      dataChannelRef.current.send(JSON.stringify(payload));
    } catch (e) {
      console.error('Failed to broadcast game state:', e);
    }
  }, []);

  // Handle peer connection setup and ICE candidate swap
  const setupWebRTC = useCallback((isHost: boolean, targetId: string, roomId: string) => {
    console.log(`Setting up WebRTC. Host: ${isHost}, targetId: ${targetId}`);
    
    // Clear old peer connections
    if (peerConnectionRef.current) {
      try { peerConnectionRef.current.close(); } catch (e) {}
    }

    const pc = new RTCPeerConnection(STUN_SERVERS);
    peerConnectionRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && mqttClientRef.current) {
        const signalTopic = `luna/chess/${roomId}/signal/${targetId}`;
        mqttClientRef.current.publish(signalTopic, JSON.stringify({
          type: 'candidate',
          from: playerId,
          data: event.candidate
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`WebRTC Connection State: ${pc.connectionState}`);
      if (pc.connectionState === 'connected') {
        setMpState(prev => ({ 
          ...prev, 
          connectionStatus: 'connected', 
          opponentOnline: true 
        }));

        // Disconnect from MQTT after a brief delay to save public resources
        setTimeout(() => {
          if (mqttClientRef.current && peerConnectionRef.current?.connectionState === 'connected') {
            console.log('WebRTC stable. Safely shutting down MQTT signaling.');
            mqttClientRef.current.end();
            mqttClientRef.current = null;
          }
        }, 5000);
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
        setMpState(prev => ({ 
          ...prev, 
          connectionStatus: 'disconnected', 
          opponentOnline: false 
        }));
      }
    };

    if (isHost) {
      // Host creates the DataChannel
      const dc = pc.createDataChannel('gameChannel', { ordered: true });
      dataChannelRef.current = dc;
      setupDataChannel(dc, true);

      pc.createOffer().then(offer => {
        return pc.setLocalDescription(offer);
      }).then(() => {
        if (mqttClientRef.current) {
          const signalTopic = `luna/chess/${roomId}/signal/${targetId}`;
          mqttClientRef.current.publish(signalTopic, JSON.stringify({
            type: 'offer',
            from: playerId,
            data: pc.localDescription
          }));
        }
      }).catch(err => console.error('Host WebRTC error:', err));
    } else {
      // Guest awaits data channel
      pc.ondatachannel = (event) => {
        const dc = event.channel;
        dataChannelRef.current = dc;
        setupDataChannel(dc, false);
      };
    }
  }, [playerId]);

  // Setup DataChannel listeners
  const setupDataChannel = (dc: RTCDataChannel, isHost: boolean) => {
    dc.onopen = () => {
      console.log('WebRTC DataChannel Opened!');
      setMpState(prev => ({ 
        ...prev, 
        connectionStatus: 'connected', 
        opponentOnline: true 
      }));
      
      if (isHost) {
        // Send initial state sync
        broadcastGameState(gameStateRef.current);
      }
    };

    dc.onclose = () => {
      console.log('WebRTC DataChannel Closed!');
      setMpState(prev => ({ 
        ...prev, 
        connectionStatus: 'disconnected', 
        opponentOnline: false 
      }));
    };

    dc.onerror = (err) => {
      console.error('DataChannel error:', err);
    };

    dc.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        console.log('Received message over DataChannel:', payload.type);

        if (payload.type === 'ROOM_UPDATE') {
          // Guest receives full board updates
          if (!isHost) {
            setGameState(payload.gameState);
            
            // Sync Guest's color (it is the opposite of the Host's color)
            if (payload.hostColor === PieceColor.RED) {
              setMpState(prev => ({ ...prev, myColor: PieceColor.BLACK }));
            } else if (payload.hostColor === PieceColor.BLACK) {
              setMpState(prev => ({ ...prev, myColor: PieceColor.RED }));
            } else {
              setMpState(prev => ({ ...prev, myColor: null }));
            }
          }
        } else if (payload.type === 'PLAYER_ACTION') {
          // Host receives Guest clicks, executes locally, and broadcasts
          if (isHost) {
            const { action } = payload;
            if (action && action.type === 'click') {
              // Trigger a click simulation in App.tsx
              window.dispatchEvent(new CustomEvent('p2p_player_click', {
                detail: { r: action.r, c: action.c }
              }));
            }
          }
        }
      } catch (err) {
        console.error('Error handling DataChannel message:', err);
      }
    };
  };

  // Host a Room
  const createRoom = useCallback((roomCode: string) => {
    disconnectAll();
    
    const roomId = roomCode.toUpperCase();
    console.log(`Hosting P2P Room: ${roomId}`);

    setMpState(prev => ({
      ...prev,
      isMultiplayerActive: true,
      isHost: true,
      roomId,
      connectionStatus: 'connecting_mqtt',
      myColor: gameStateRef.current.mode === GameMode.CLASSIC ? PieceColor.RED : null // Red in classic, null in Dark
    }));

    const client = mqtt.connect(MQTT_BROKER, {
      connectTimeout: 4000,
      reconnectPeriod: 2000,
    });
    mqttClientRef.current = client;

    client.on('connect', () => {
      console.log('Host connected to MQTT Signaling Broker');
      setMpState(prev => ({ ...prev, connectionStatus: 'lobby' }));
      
      // Subscribe to join requests and own signal
      client.subscribe(`luna/chess/${roomId}/join`);
      client.subscribe(`luna/chess/${roomId}/signal/${playerId}`);
    });

    client.on('message', (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        
        if (topic === `luna/chess/${roomId}/join`) {
          console.log(`Guest join request received: ${payload.name} (${payload.id})`);
          
          setMpState(prev => ({
            ...prev,
            opponentId: payload.id,
            opponentName: payload.name,
            opponentOnline: true
          }));

          // Notify guest of Host details
          client.publish(`luna/chess/${roomId}/lobby_sync`, JSON.stringify({
            hostId: playerId,
            hostName: playerName,
            mode: gameStateRef.current.mode
          }));

          // Initiate WebRTC
          setMpState(prev => ({ ...prev, connectionStatus: 'connecting_webrtc' }));
          setupWebRTC(true, payload.id, roomId);
        } 
        else if (topic === `luna/chess/${roomId}/signal/${playerId}`) {
          // WebRTC Signaling
          const pc = peerConnectionRef.current;
          if (!pc) return;

          if (payload.type === 'answer') {
            console.log('Host received Answer SDP');
            pc.setRemoteDescription(new RTCSessionDescription(payload.data))
              .catch(e => console.error('Host set remote description error:', e));
          } else if (payload.type === 'candidate') {
            console.log('Host received ICE Candidate');
            pc.addIceCandidate(new RTCIceCandidate(payload.data))
              .catch(e => console.error('Host add ICE candidate error:', e));
          }
        }
      } catch (e) {
        console.error('Host MQTT message error:', e);
      }
    });

    client.on('error', (err) => {
      console.error('Host MQTT error:', err);
    });
  }, [playerId, playerName, setupWebRTC, disconnectAll]);

  // Join a Room
  const joinRoom = useCallback((roomCode: string) => {
    disconnectAll();
    
    const roomId = roomCode.toUpperCase();
    console.log(`Joining P2P Room: ${roomId}`);

    setMpState(prev => ({
      ...prev,
      isMultiplayerActive: true,
      isHost: false,
      roomId,
      connectionStatus: 'connecting_mqtt'
    }));

    const client = mqtt.connect(MQTT_BROKER, {
      connectTimeout: 4000,
      reconnectPeriod: 2000,
    });
    mqttClientRef.current = client;

    client.on('connect', () => {
      console.log('Guest connected to MQTT Signaling Broker');
      setMpState(prev => ({ ...prev, connectionStatus: 'lobby' }));
      
      // Subscribe to lobby syncs and own signal
      client.subscribe(`luna/chess/${roomId}/lobby_sync`);
      client.subscribe(`luna/chess/${roomId}/signal/${playerId}`);

      // Publish join request
      client.publish(`luna/chess/${roomId}/join`, JSON.stringify({
        id: playerId,
        name: playerName
      }));
    });

    client.on('message', (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        
        if (topic === `luna/chess/${roomId}/lobby_sync`) {
          console.log(`Lobby synchronized: Host is ${payload.hostName}`);
          
          setMpState(prev => ({
            ...prev,
            opponentId: payload.hostId,
            opponentName: payload.hostName,
            opponentOnline: true,
            connectionStatus: 'connecting_webrtc',
            // Guest is Black in classic mode. Guest is null in Dark mode (first-flip decides)
            myColor: payload.mode === GameMode.CLASSIC ? PieceColor.BLACK : null
          }));

          // Set client's local board mode to match the Host's
          if (payload.mode !== gameStateRef.current.mode) {
            initGame(payload.mode);
          }
        } 
        else if (topic === `luna/chess/${roomId}/signal/${playerId}`) {
          // WebRTC Signaling
          if (payload.type === 'offer') {
            console.log('Guest received Offer SDP. Creating PeerConnection...');
            
            // Set up peer
            setupWebRTC(false, payload.from, roomId);
            const pc = peerConnectionRef.current;
            if (!pc) return;

            pc.setRemoteDescription(new RTCSessionDescription(payload.data))
              .then(() => pc.createAnswer())
              .then(answer => pc.setLocalDescription(answer))
              .then(() => {
                client.publish(`luna/chess/${roomId}/signal/${payload.from}`, JSON.stringify({
                  type: 'answer',
                  from: playerId,
                  data: pc.localDescription
                }));
              })
              .catch(e => console.error('Guest SDP Handshake error:', e));
          } else if (payload.type === 'candidate') {
            console.log('Guest received ICE Candidate');
            const pc = peerConnectionRef.current;
            if (pc) {
              pc.addIceCandidate(new RTCIceCandidate(payload.data))
                .catch(e => console.error('Guest add ICE candidate error:', e));
            }
          }
        }
      } catch (e) {
        console.error('Guest MQTT message error:', e);
      }
    });

    client.on('error', (err) => {
      console.error('Guest MQTT error:', err);
    });
  }, [playerId, playerName, setupWebRTC, disconnectAll, initGame]);

  // Guest clicks a square - sends to Host
  const sendPlayerAction = useCallback((r: number, c: number) => {
    if (mpStateRef.current.isHost || !dataChannelRef.current || dataChannelRef.current.readyState !== 'open') return;

    console.log(`Sending player click action to Host: [${r}, ${c}]`);
    try {
      dataChannelRef.current.send(JSON.stringify({
        type: 'PLAYER_ACTION',
        action: { type: 'click', r, c }
      }));
    } catch (e) {
      console.error('Failed to send player click:', e);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectAll();
    };
  }, [disconnectAll]);

  return {
    mpState,
    setMpState,
    setPlayerName,
    createRoom,
    joinRoom,
    sendPlayerAction,
    broadcastGameState,
    disconnectAll
  };
}
