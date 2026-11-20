import { Component, type ReactNode } from 'react';

export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(prev: { resetKey: string }) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen">
        <div className="notice bad" role="alert" style={{ marginTop: 24 }}>
          <b>Something went wrong on this screen.</b> Your progress is saved. Go back and try again.
          <div style={{ marginTop: 10 }}><button className="btn small" onClick={() => { this.setState({ error: null }); history.back(); }}>Go back</button></div>
        </div>
      </div>
    );
  }
}
