export function AgentMiniGatewayVisual() {
  const nodes = ['Chat', 'Profile', 'Discover', 'Approval'];

  return (
    <div className="agent-mini-gateway" aria-hidden="true">
      <div className="agent-mini-gateway__beam" />
      <div className="agent-mini-gateway__core">
        <span>
          <img src="/favicon-192.png" alt="" width="58" height="58" />
        </span>
      </div>
      <div className="agent-mini-gateway__ring agent-mini-gateway__ring--outer" />
      <div className="agent-mini-gateway__ring agent-mini-gateway__ring--middle" />
      <div className="agent-mini-gateway__ring agent-mini-gateway__ring--inner" />
      {nodes.map((node, index) => (
        <span key={node} className={`agent-mini-gateway__node agent-mini-gateway__node--${index + 1}`}>
          <i />
          {node}
        </span>
      ))}
      <div className="agent-mini-gateway__platform" />
    </div>
  );
}
