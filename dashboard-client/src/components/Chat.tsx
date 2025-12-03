import useSocketManager from "../hooks/useSocketManager";

const Chat = () => {
  const socket = useSocketManager("ws://localhost:8000/ws");

  const sendMessage = () => {
    socket.send({ text: "Ping!" });
  };

  return <button onClick={sendMessage}>Sent</button>;
};

export default Chat;
