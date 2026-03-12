import { useState, useRef, useCallback } from "react";

// STUN servers for NAT traversal / peer discovery
export const STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

const RTC_CONFIG: RTCConfiguration = {
  iceServers: STUN_SERVERS,
  iceCandidatePoolSize: 10,
};

export interface RtcPeerInfo {
  id: string;
  iceState: RTCIceConnectionState;
  channelState: RTCDataChannelState | "none";
  isConnected: boolean;
  negotiating: boolean;
}

interface UseWebRTCOptions {
  role: "broadcaster" | "listener";
  myWsId: string;
  sendSignaling: (msg: Record<string, unknown>) => void;
  onSyncMessage: (msg: Record<string, unknown>) => void;
}

interface PeerEntry {
  id: string;
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
}

export function useWebRTC({ role, myWsId, sendSignaling, onSyncMessage }: UseWebRTCOptions) {
  const peersRef = useRef<Map<string, PeerEntry>>(new Map());
  const [peerInfos, setPeerInfos] = useState<RtcPeerInfo[]>([]);

  const refreshState = useCallback(() => {
    const infos: RtcPeerInfo[] = [];
    for (const [id, entry] of peersRef.current) {
      infos.push({
        id,
        iceState: entry.pc.iceConnectionState,
        channelState: entry.channel ? entry.channel.readyState : "none",
        isConnected:
          entry.pc.iceConnectionState === "connected" ||
          entry.pc.iceConnectionState === "completed",
        negotiating: entry.channel === null,
      });
    }
    setPeerInfos(infos);
  }, []);

  const setupPeerListeners = useCallback(
    (id: string, pc: RTCPeerConnection) => {
      pc.oniceconnectionstatechange = () => refreshState();
      pc.onicegatheringstatechange = () => refreshState();
      pc.onconnectionstatechange = () => refreshState();
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          if (role === "listener") {
            sendSignaling({ type: "rtc_ice", to: "broadcaster", candidate: e.candidate.toJSON() });
          } else {
            sendSignaling({ type: "rtc_ice", to: id, candidate: e.candidate.toJSON() });
          }
        }
      };
    },
    [role, sendSignaling, refreshState]
  );

  const setupChannelListeners = useCallback(
    (entry: PeerEntry, ch: RTCDataChannel) => {
      entry.channel = ch;
      ch.onopen = () => {
        console.log(`[RTC] Data channel open with ${entry.id}`);
        refreshState();
      };
      ch.onclose = () => {
        console.log(`[RTC] Data channel closed with ${entry.id}`);
        refreshState();
      };
      ch.onmessage = (ev) => {
        try {
          onSyncMessage(JSON.parse(ev.data as string));
        } catch {
          // ignore
        }
      };
      refreshState();
    },
    [refreshState, onSyncMessage]
  );

  // Listener: initiate WebRTC offer to broadcaster
  const initAsListener = useCallback(async () => {
    if (role !== "listener" || !myWsId) return;
    if (peersRef.current.has("broadcaster")) return; // already initiated

    console.log("[RTC] Listener initiating connection...");
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const ch = pc.createDataChannel("hawkins-sync", { ordered: true });
    const entry: PeerEntry = { id: "broadcaster", pc, channel: null };
    peersRef.current.set("broadcaster", entry);

    setupPeerListeners("broadcaster", pc);
    setupChannelListeners(entry, ch);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignaling({ type: "rtc_offer", sdp: pc.localDescription?.toJSON() });
    refreshState();
  }, [role, myWsId, sendSignaling, setupPeerListeners, setupChannelListeners, refreshState]);

  // Handle all incoming signaling messages
  const handleSignaling = useCallback(
    async (msg: Record<string, unknown>) => {
      const type = msg.type as string;

      // Broadcaster receives offer from a listener
      if (type === "rtc_offer" && role === "broadcaster") {
        const peerId = msg.from as string;
        const sdp = msg.sdp as RTCSessionDescriptionInit;

        // Clean up existing peer if any
        const existing = peersRef.current.get(peerId);
        if (existing) {
          existing.pc.close();
          peersRef.current.delete(peerId);
        }

        const pc = new RTCPeerConnection(RTC_CONFIG);
        const entry: PeerEntry = { id: peerId, pc, channel: null };
        peersRef.current.set(peerId, entry);
        setupPeerListeners(peerId, pc);

        pc.ondatachannel = (e) => {
          setupChannelListeners(entry, e.channel);
        };

        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignaling({ type: "rtc_answer", to: peerId, sdp: pc.localDescription?.toJSON() });
        refreshState();
      }

      // Listener receives answer from broadcaster
      if (type === "rtc_answer" && role === "listener") {
        const sdp = msg.sdp as RTCSessionDescriptionInit;
        const peer = peersRef.current.get("broadcaster");
        if (peer) {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
          refreshState();
        }
      }

      // ICE candidate relay
      if (type === "rtc_ice") {
        const candidate = msg.candidate as RTCIceCandidateInit;
        const peerId = role === "listener" ? "broadcaster" : (msg.from as string);
        const peer = peersRef.current.get(peerId);
        if (peer && candidate) {
          try {
            await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch {
            // ignore stale candidates
          }
        }
      }

      // Broadcaster: listener disconnected
      if (type === "rtc_peer_disconnected") {
        const peerId = msg.peerId as string;
        const peer = peersRef.current.get(peerId);
        if (peer) {
          peer.pc.close();
          peersRef.current.delete(peerId);
          refreshState();
        }
      }
    },
    [role, sendSignaling, setupPeerListeners, setupChannelListeners, refreshState]
  );

  // Broadcaster: send sync message to all connected P2P listeners
  const broadcastViaPeers = useCallback(
    (msg: Record<string, unknown>) => {
      if (role !== "broadcaster") return 0;
      const data = JSON.stringify(msg);
      let sent = 0;
      for (const entry of peersRef.current.values()) {
        if (entry.channel?.readyState === "open") {
          entry.channel.send(data);
          sent++;
        }
      }
      return sent;
    },
    [role]
  );

  // Cleanup all peers
  const closeAll = useCallback(() => {
    for (const entry of peersRef.current.values()) {
      entry.pc.close();
    }
    peersRef.current.clear();
    setPeerInfos([]);
  }, []);

  const connectedPeers = peerInfos.filter((p) => p.isConnected);
  const hasP2P = connectedPeers.length > 0;

  return {
    handleSignaling,
    initAsListener,
    broadcastViaPeers,
    closeAll,
    peerInfos,
    connectedPeers,
    hasP2P,
    stunServers: STUN_SERVERS,
  };
}
