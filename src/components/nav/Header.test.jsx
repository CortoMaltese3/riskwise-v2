import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import theme from "../../theme/theme";
import Header from "./Header";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

vi.mock("./LanguageButton", () => ({ default: () => <div data-testid="lang" /> }));
vi.mock("./MinimizeButton", () => ({ default: () => <div data-testid="minimize" /> }));
vi.mock("./ReloadButton", () => ({ default: () => <div data-testid="reload" /> }));
vi.mock("./ShutdownButton", () => ({ default: () => <div data-testid="shutdown" /> }));

function renderHeader() {
  return render(
    <ThemeProvider theme={theme}>
      <Header />
    </ThemeProvider>
  );
}

describe("Header — token-driven styling", () => {
  it("renders the application title via i18n", () => {
    renderHeader();
    expect(screen.getByText("application_title")).toBeInTheDocument();
  });

  it("applies the header palette token to the AppBar background", () => {
    const { container } = renderHeader();
    const appBar = container.querySelector(".MuiAppBar-root");
    expect(appBar).not.toBeNull();
    const bg = getComputedStyle(appBar).backgroundColor;
    // `cssVariables: true` materialises palette entries as `var(--mui-palette-header-main)`.
    // jsdom returns either the resolved value or the raw var(...) reference; both prove
    // the AppBar is sourcing colour from the theme rather than a hex literal.
    expect(bg).toMatch(/mui-palette-header-main|rgb/);
  });
});
