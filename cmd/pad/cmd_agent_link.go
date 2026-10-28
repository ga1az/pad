package main

import (
	"fmt"
	"os"
	"text/tabwriter"
	"time"

	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/PerpetualSoftware/pad/internal/cli"
)

// Agents that join a workspace through a link (SPEC-15, TASK-16). Not on the
// MCP surface on purpose: a link mints agent credentials, and the server
// refuses minting to anything but an interactive session.

func agentLinkCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "link",
		Short: "Invite agents to the workspace with a join link (no plugin needed)",
		RunE:  unknownSubcommandRun,
		Long: `A join link lets any agent that can make HTTP requests join this workspace:
paste the link into the agent's session. It registers with a name, gets a token
for this workspace only, and can be assigned tasks. Links and agent tokens
expire after 7 days; revoking a link revokes every agent it registered.`,
		Example: `  pad agent link create --label "claude in repo X"
  pad agent link list
  pad agent link revoke <id>`,
	}
	cmd.AddCommand(agentLinkCreateCmd(), agentLinkListCmd(), agentLinkRevokeCmd())
	return cmd
}

func agentLinkCreateCmd() *cobra.Command {
	var label string
	cmd := &cobra.Command{
		Use:     "create",
		Short:   "Create a join link (shown once)",
		Example: `  pad agent link create --label "reviewer"`,
		RunE: func(cmd *cobra.Command, args []string) error {
			client, _ := getClient()
			link, err := client.CreateAgentJoinLink(getWorkspace(), label)
			if err != nil {
				return err
			}
			if formatFlag == "json" {
				return cli.PrintJSON(link)
			}
			green := color.New(color.FgGreen)
			dim := color.New(color.Faint)
			fmt.Printf("%s Join link created (expires %s). Paste this into an agent's session:\n\n", green.Sprint("✓"), link.ExpiresAt.Local().Format(time.RFC1123))
			msg := link.InviteMessage
			if msg == "" { // a server from before TASK-23
				msg = link.URL
			}
			fmt.Println(msg)
			fmt.Println()
			fmt.Println(dim.Sprint("It is shown only now; revoke it with: pad agent link revoke " + link.ID))
			return nil
		},
	}
	cmd.Flags().StringVar(&label, "label", "", "a note for yourself about who the link is for")
	return cmd
}

func agentLinkListCmd() *cobra.Command {
	return &cobra.Command{
		Use:     "list",
		Short:   "List the workspace's join links",
		Example: `  pad agent link list`,
		Aliases: []string{"ls"},
		RunE: func(cmd *cobra.Command, args []string) error {
			client, _ := getClient()
			links, err := client.ListAgentJoinLinks(getWorkspace())
			if err != nil {
				return err
			}
			if formatFlag == "json" {
				return cli.PrintJSON(links)
			}
			if len(links) == 0 {
				fmt.Println("No join links. Create one with: pad agent link create")
				return nil
			}
			dim := color.New(color.Faint)
			w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", dim.Sprint("ID"), dim.Sprint("LABEL"), dim.Sprint("AGENTS"), dim.Sprint("STATE"))
			for _, l := range links {
				state := "active until " + l.ExpiresAt.Local().Format("2006-01-02 15:04")
				switch {
				case l.RevokedAt != nil:
					state = "revoked"
				case !time.Now().Before(l.ExpiresAt):
					state = "expired"
				}
				fmt.Fprintf(w, "%s\t%s\t%d/%d\t%s\n", l.ID, l.Label, l.AgentCount, l.MaxAgents, state)
			}
			return w.Flush()
		},
	}
}

func agentLinkRevokeCmd() *cobra.Command {
	return &cobra.Command{
		Use:     "revoke <id>",
		Short:   "Revoke a join link and every agent it registered",
		Example: `  pad agent link revoke <id>`,
		Args:    cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			client, _ := getClient()
			if err := client.RevokeAgentJoinLink(getWorkspace(), args[0]); err != nil {
				return err
			}
			fmt.Printf("%s Join link %s revoked, with its agents\n", color.New(color.FgGreen).Sprint("✓"), args[0])
			return nil
		},
	}
}

func agentListCmd() *cobra.Command {
	var all bool
	cmd := &cobra.Command{
		Use:     "list",
		Short:   "List agents that joined the workspace through a link",
		Example: `  pad agent list --all`,
		Aliases: []string{"ls"},
		RunE: func(cmd *cobra.Command, args []string) error {
			client, _ := getClient()
			agents, err := client.ListWorkspaceAgents(getWorkspace(), all)
			if err != nil {
				return err
			}
			if formatFlag == "json" {
				return cli.PrintJSON(agents)
			}
			if len(agents) == 0 {
				fmt.Println("No agents have joined. Invite one with: pad agent link create")
				return nil
			}
			dim := color.New(color.Faint)
			w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintf(w, "%s\t%s\t%s\n", dim.Sprint("ID"), dim.Sprint("NAME"), dim.Sprint("LAST SEEN"))
			for _, a := range agents {
				seen := "never"
				if a.LastSeenAt != nil {
					seen = a.LastSeenAt.Local().Format("2006-01-02 15:04")
				}
				if a.RevokedAt != nil {
					seen += " (revoked)"
				}
				fmt.Fprintf(w, "%s\t%s\t%s\n", a.ID, a.DisplayName, seen)
			}
			return w.Flush()
		},
	}
	cmd.Flags().BoolVar(&all, "all", false, "include revoked agents (owner only)")
	return cmd
}

func agentRevokeCmd() *cobra.Command {
	return &cobra.Command{
		Use:     "revoke <id>",
		Short:   "Revoke an agent that joined through a link",
		Example: `  pad agent revoke <id>`,
		Args:    cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			client, _ := getClient()
			if err := client.RevokeWorkspaceAgent(getWorkspace(), args[0]); err != nil {
				return err
			}
			fmt.Printf("%s Agent %s revoked\n", color.New(color.FgGreen).Sprint("✓"), args[0])
			return nil
		},
	}
}
