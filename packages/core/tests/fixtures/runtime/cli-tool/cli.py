#!/usr/bin/env python3
"""
CLI tool fixture — basic CLI with click.
"""

import sys
import click


@click.group()
def cli():
    """A sample CLI tool."""
    pass


@cli.command()
@click.argument("name")
def greet(name: str):
    """Greet a user by name."""
    click.echo(f"Hello, {name}!")


@cli.command()
def version():
    """Show version."""
    click.echo("cli-tool 0.1.0")


if __name__ == "__main__":
    cli()
