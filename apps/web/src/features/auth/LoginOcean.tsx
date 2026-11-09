import { WhaleShark } from "./WhaleShark";
import "./login-ocean.css";

export function LoginOcean() {
  return (
    <div className="login-ocean" aria-hidden="true">
      <div className="login-ocean__rays" />
      <div className="login-ocean__swimmer">
        <div className="login-ocean__heading">
          <WhaleShark />
        </div>
      </div>
      <div className="login-ocean__particles" />
    </div>
  );
}
